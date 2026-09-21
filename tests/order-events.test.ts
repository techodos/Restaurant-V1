import { readFileSync } from "node:fs";
import { EventEmitter } from "node:events";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ORDER_STATUSES, type OrderStatus } from "@/shared/contract/enums";
import type { Order, OrderStatusEvent } from "@/shared/contract/models";
import {
  nextLiveState,
  parseLiveOrderState,
  parseOrderRecord,
  toLiveState,
  withLiveStatus,
  type LiveOrderState,
} from "@/shared/order-live";
import { buildOrderTimeline } from "@/shared/order-timeline";

/** Live order status (SSE + LISTEN/NOTIFY) without a database, a browser or a network. */

const T0 = "2026-09-20T10:00:00.000Z";
const at = (minutes: number) => new Date(Date.parse(T0) + minutes * 60_000).toISOString();

function state(status: OrderStatus, minutes = 0, extra: Partial<LiveOrderState> = {}): LiveOrderState {
  return { status, paymentStatus: "pending", estimatedReadyAt: null, updatedAt: at(minutes), ...extra };
}

function row(status: string, minutes: number, extra: Record<string, unknown> = {}) {
  return { id: "o1", status, payment_status: "pending", estimated_ready_at: null, updated_at: at(minutes), notes: "x", ...extra };
}

function historyTo(...statuses: OrderStatus[]): OrderStatusEvent[] {
  return statuses.map((toStatus, index) => ({
    id: `h${index}`,
    orderId: "o1",
    fromStatus: index === 0 ? null : statuses[index - 1]!,
    toStatus,
    note: null,
    changedByName: null,
    createdAt: at(index),
  }));
}

describe("parsing", () => {
  it("reads the fields the page cares about from a NOTIFY payload", () => {
    expect(parseOrderRecord(row("preparing", 3, { estimated_ready_at: at(30) }))).toEqual({
      status: "preparing",
      paymentStatus: "pending",
      estimatedReadyAt: at(30),
      updatedAt: at(3),
    });
  });

  it("rejects payloads that are not usable orders", () => {
    expect(parseOrderRecord(null)).toBeNull();
    expect(parseOrderRecord({})).toBeNull();
    expect(parseOrderRecord(row("teleporting", 1))).toBeNull();
    expect(parseOrderRecord(row("ready", 1, { payment_status: "???" }))).toBeNull();
    expect(parseOrderRecord(row("ready", 1, { updated_at: "not a date" }))).toBeNull();
  });

  it("validates what the browser receives over SSE", () => {
    const wire = JSON.parse(JSON.stringify(state("ready", 2)));
    expect(parseLiveOrderState(wire)).toEqual(state("ready", 2));
    expect(parseLiveOrderState({ ...wire, status: "nope" })).toBeNull();
    expect(parseLiveOrderState("ready")).toBeNull();
    expect(parseLiveOrderState(null)).toBeNull();
  });

  it("builds the snapshot state from a full order", () => {
    const order = { status: "ready", paymentStatus: "paid", estimatedReadyAt: null, updatedAt: at(4) } as const;
    expect(toLiveState(order)).toEqual({ status: "ready", paymentStatus: "paid", estimatedReadyAt: null, updatedAt: at(4) });
  });
});

describe("nextLiveState", () => {
  it("applies every step of the order lifecycle", () => {
    const flow: OrderStatus[] = ["pending", "confirmed", "preparing", "ready", "out_for_delivery", "completed"];
    let current = state("pending");
    for (const [index, status] of flow.slice(1).entries()) {
      const result = nextLiveState(current, state(status, index + 1));
      expect(result.changed).toBe(true);
      expect(result.state.status).toBe(status);
      current = result.state;
    }
  });

  it("ignores a repeated status (PREPARING -> PREPARING)", () => {
    const current = state("preparing", 2);
    const result = nextLiveState(current, state("preparing", 3));
    expect(result.changed).toBe(false);
    expect(result.state).toBe(current);
  });

  it("ignores a late event that is older than what is already shown", () => {
    const current = state("ready", 5);
    const result = nextLiveState(current, state("preparing", 3));
    expect(result.changed).toBe(false);
    expect(result.state.status).toBe("ready");
  });

  it("still applies payment or ETA changes so other legitimate updates are not lost", () => {
    const current = state("preparing", 2);
    expect(nextLiveState(current, state("preparing", 3, { paymentStatus: "paid" })).changed).toBe(true);
    expect(nextLiveState(current, state("preparing", 3, { estimatedReadyAt: at(40) })).changed).toBe(true);
  });

  it("catches up on a status missed while disconnected (the reconnect snapshot is just another state)", () => {
    expect(nextLiveState(state("confirmed", 1), state("ready", 9)).state.status).toBe("ready");
  });

  it("does not react to the snapshot when it equals what the page rendered", () => {
    expect(nextLiveState(state("preparing", 2), state("preparing", 2)).changed).toBe(false);
  });
});

describe("withLiveStatus + timeline", () => {
  it("adds the newer live transition so the timeline moves before the page is re-rendered", () => {
    const live = state("preparing", 5);
    const steps = buildOrderTimeline(withLiveStatus(historyTo("pending", "confirmed"), live), { orderType: "pickup" });
    expect(steps.find((step) => step.status === "preparing")?.state).toBe("current");
    expect(steps.find((step) => step.status === "confirmed")?.state).toBe("done");
    expect(steps.find((step) => step.status === "preparing")?.at).toBe(live.updatedAt);
  });

  it("leaves the history alone once the server already has the status", () => {
    const history = historyTo("pending", "confirmed", "preparing");
    expect(withLiveStatus(history, state("preparing", 5))).toBe(history);
  });

  it("does not invent a transition for a brand-new pending order", () => {
    expect(withLiveStatus([], state("pending"))).toEqual([]);
  });

  it("shows a cancellation", () => {
    const steps = buildOrderTimeline(withLiveStatus(historyTo("pending", "confirmed"), state("cancelled", 4)), { orderType: "delivery" });
    expect(steps.some((step) => step.state === "cancelled")).toBe(true);
  });

  it("knows every order status", () => {
    for (const status of ORDER_STATUSES) {
      expect(() => buildOrderTimeline(withLiveStatus([], state(status)), { orderType: "delivery" })).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
// LISTEN hub (server/db/listener.ts) against a fake pg client
// ---------------------------------------------------------------------------------------------------------------

const pg = vi.hoisted(() => {
  const { EventEmitter: Emitter } = require("node:events") as { EventEmitter: typeof EventEmitter };
  class FakeClient extends Emitter {
    static instances: FakeClient[] = [];
    static failConnect = false;
    queries: string[] = [];
    ended = false;
    constructor(public options: unknown) {
      super();
      FakeClient.instances.push(this);
    }
    async connect() {
      if (FakeClient.failConnect) throw new Error("connection refused");
    }
    async query(sql: string) {
      this.queries.push(sql);
      return { rows: [] };
    }
    async end() {
      this.ended = true;
    }
    notify(payload: string, channel = "order_changes") {
      this.emit("notification", { channel, payload });
    }
  }
  return { FakeClient };
});

vi.mock("pg", () => ({ Client: pg.FakeClient }));

describe("LISTEN hub", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    pg.FakeClient.instances = [];
    pg.FakeClient.failConnect = false;
    delete (globalThis as { __rpListenHubs?: unknown }).__rpListenHubs;
    vi.resetModules();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const load = async () => (await import("@/server/db/listener")).listenToChannel;
  const handlers = () => ({ onNotify: vi.fn(), onReset: vi.fn() });

  it("serves every subscriber from ONE connection and ONE LISTEN", async () => {
    const listen = await load();
    const a = handlers();
    const b = handlers();
    await listen("postgres://x", "order_changes", a);
    await listen("postgres://x", "order_changes", b);
    expect(pg.FakeClient.instances).toHaveLength(1);
    expect(pg.FakeClient.instances[0]!.queries).toEqual(["listen order_changes"]);

    pg.FakeClient.instances[0]!.notify('{"id":"o1"}');
    expect(a.onNotify).toHaveBeenCalledWith('{"id":"o1"}');
    expect(b.onNotify).toHaveBeenCalledWith('{"id":"o1"}');
  });

  it("stops delivering after unsubscribe and closes the connection once idle", async () => {
    const listen = await load();
    const h = handlers();
    const stop = await listen("postgres://x", "order_changes", h);
    stop();
    stop(); // idempotent
    pg.FakeClient.instances[0]!.notify("{}");
    expect(h.onNotify).not.toHaveBeenCalled();

    expect(pg.FakeClient.instances[0]!.ended).toBe(false);
    await vi.advanceTimersByTimeAsync(31_000);
    expect(pg.FakeClient.instances[0]!.ended).toBe(true);
  });

  it("ignores other channels", async () => {
    const listen = await load();
    const h = handlers();
    await listen("postgres://x", "order_changes", h);
    pg.FakeClient.instances[0]!.notify("{}", "something_else");
    expect(h.onNotify).not.toHaveBeenCalled();
  });

  it("reconnects with back-off after a lost connection and tells subscribers to re-read", async () => {
    const listen = await load();
    const h = handlers();
    await listen("postgres://x", "order_changes", h);
    pg.FakeClient.instances[0]!.emit("error", new Error("terminating connection"));
    expect(h.onReset).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1_100);
    expect(pg.FakeClient.instances).toHaveLength(2);
    expect(pg.FakeClient.instances[1]!.queries).toEqual(["listen order_changes"]);
    expect(h.onReset).toHaveBeenCalledTimes(1);

    pg.FakeClient.instances[1]!.notify('{"id":"o1"}');
    expect(h.onNotify).toHaveBeenCalledTimes(1);
  });

  it("rejects the first subscriber when the database cannot be reached", async () => {
    pg.FakeClient.failConnect = true;
    const listen = await load();
    await expect(listen("postgres://x", "order_changes", handlers())).rejects.toThrow("connection refused");
  });

  it("refuses channel names that are not plain identifiers", async () => {
    const listen = await load();
    expect(() => listen("postgres://x", "x; drop table orders", handlers())).toThrow("Invalid channel name");
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Service: ownership, order of steps, tenant check, clean-up
// ---------------------------------------------------------------------------------------------------------------

const feed = vi.hoisted(() => ({
  handlers: null as null | { onChange: (r: Record<string, unknown>) => void; onReset: () => void },
  stop: vi.fn(),
  watch: vi.fn(),
  calls: [] as string[],
}));
const orders = vi.hoisted(() => ({ find: vi.fn() }));

vi.mock("@/server/repositories/order-events", () => ({
  orderChangeFeedConfigured: () => true,
  watchOrderChanges: feed.watch,
}));
vi.mock("@/server/services/orders", () => ({ findVisitorOrder: orders.find }));

const RESTAURANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RESTAURANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function orderRow(status: OrderStatus, minutes: number, restaurantId = RESTAURANT_A) {
  return { id: "order-a1", restaurantId, status, paymentStatus: "pending", estimatedReadyAt: null, updatedAt: at(minutes) } as unknown as Order;
}

describe("openOrderStream", () => {
  beforeEach(() => {
    vi.resetModules();
    feed.handlers = null;
    feed.calls = [];
    feed.stop.mockReset();
    feed.watch.mockReset();
    feed.watch.mockImplementation(async (orderId: string, handlers: typeof feed.handlers) => {
      feed.calls.push(`watch:${orderId}`);
      feed.handlers = handlers;
      return feed.stop;
    });
    orders.find.mockReset();
  });

  const open = async (sink: { send: (s: LiveOrderState) => void; end: () => void }) => {
    const { openOrderStream } = await import("@/server/services/order-events");
    return openOrderStream(RESTAURANT_A, "ORD-1", { restaurantId: RESTAURANT_A } as never, null, sink);
  };
  const sink = () => ({ send: vi.fn<(s: LiveOrderState) => void>(), end: vi.fn() });

  it("refuses a visitor who may not see the order and never subscribes", async () => {
    orders.find.mockResolvedValue(null);
    const s = sink();
    expect(await open(s)).toBeNull();
    expect(feed.watch).not.toHaveBeenCalled();
    expect(s.send).not.toHaveBeenCalled();
  });

  it("subscribes BEFORE it reads the snapshot, so nothing can fall in the gap", async () => {
    orders.find.mockImplementation(async () => {
      feed.calls.push("read");
      return orderRow("preparing", 3);
    });
    const s = sink();
    await open(s);
    expect(feed.calls).toEqual(["read", "watch:order-a1", "read"]);
    expect(s.send).toHaveBeenCalledWith(state("preparing", 3));
  });

  it("forwards each change to the visitor's order, and only for their restaurant", async () => {
    orders.find.mockResolvedValue(orderRow("confirmed", 1));
    const s = sink();
    await open(s);
    s.send.mockClear();

    feed.handlers!.onChange({ id: "order-a1", restaurant_id: RESTAURANT_B, status: "ready", payment_status: "pending", estimated_ready_at: null, updated_at: at(5) });
    expect(s.send).not.toHaveBeenCalled(); // wrong tenant

    feed.handlers!.onChange({ id: "order-a1", restaurant_id: RESTAURANT_A, status: "preparing", payment_status: "pending", estimated_ready_at: null, updated_at: at(2) });
    expect(s.send).toHaveBeenCalledWith(state("preparing", 2));

    feed.handlers!.onChange({ id: "order-a1", restaurant_id: RESTAURANT_A, status: "bogus", payment_status: "pending", estimated_ready_at: null, updated_at: at(3) });
    expect(s.send).toHaveBeenCalledTimes(1); // malformed payload ignored
  });

  it("ends the stream and stops listening once the order is finished", async () => {
    orders.find.mockResolvedValue(orderRow("out_for_delivery", 4));
    const s = sink();
    await open(s);

    feed.handlers!.onChange({ id: "order-a1", restaurant_id: RESTAURANT_A, status: "completed", payment_status: "paid", estimated_ready_at: null, updated_at: at(6) });
    expect(s.send).toHaveBeenLastCalledWith(state("completed", 6, { paymentStatus: "paid" }));
    expect(s.end).toHaveBeenCalledTimes(1);
    expect(feed.stop).toHaveBeenCalled();

    s.send.mockClear();
    feed.handlers!.onChange({ id: "order-a1", restaurant_id: RESTAURANT_A, status: "completed", payment_status: "paid", estimated_ready_at: null, updated_at: at(7) });
    expect(s.send).not.toHaveBeenCalled();
  });

  it("ends immediately when the order was already finished at connect time", async () => {
    orders.find.mockResolvedValue(orderRow("completed", 9));
    const s = sink();
    await open(s);
    expect(s.send).toHaveBeenCalledWith(state("completed", 9));
    expect(s.end).toHaveBeenCalled();
    expect(feed.stop).toHaveBeenCalled();
  });

  it("re-reads the order when the change feed had to reconnect", async () => {
    orders.find.mockResolvedValueOnce(orderRow("confirmed", 1)).mockResolvedValueOnce(orderRow("confirmed", 1));
    const s = sink();
    await open(s);
    s.send.mockClear();

    orders.find.mockResolvedValue(orderRow("ready", 8)); // changed while the feed was down
    feed.handlers!.onReset();
    await vi.waitFor(() => expect(s.send).toHaveBeenCalledWith(state("ready", 8)));
  });

  it("stops listening when the client goes away", async () => {
    orders.find.mockResolvedValue(orderRow("confirmed", 1));
    const stream = await open(sink());
    stream!.close();
    expect(feed.stop).toHaveBeenCalled();
  });

  it("does not leak a subscription when the snapshot read fails", async () => {
    orders.find.mockResolvedValueOnce(orderRow("confirmed", 1)).mockRejectedValueOnce(new Error("db down"));
    await expect(open(sink())).rejects.toThrow("db down");
    expect(feed.stop).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Static guarantees
// ---------------------------------------------------------------------------------------------------------------

describe("no polling, no Supabase Realtime, providers stay separate", () => {
  const read = (file: string) => readFileSync(path.resolve(process.cwd(), file), "utf8");
  const live = [
    "src/components/storefront/order-live-status.tsx",
    "src/components/storefront/use-order-events.ts",
    "src/app/r/[restaurantSlug]/order/[orderNumber]/page.tsx",
  ];

  it("has no interval, timed refetch or Supabase client in the order page code", () => {
    for (const file of live) {
      const source = read(file);
      expect(source, file).not.toMatch(/setInterval|every 30 seconds|refresh\(\)\s*,\s*30/i);
      expect(source, file).not.toMatch(/@supabase\/supabase-js|WebSocket/);
    }
  });

  it("does not poll on the server either: the SSE route only sends a keep-alive comment", () => {
    const route = read("src/app/r/[restaurantSlug]/order/[orderNumber]/events/route.ts");
    expect(route.match(/setInterval\(/g)).toHaveLength(1);
    expect(route).toMatch(/`: ping\\n\\n`/);
    expect(read("src/server/services/order-events.ts")).not.toMatch(/setInterval|setTimeout/);
    expect(read("src/server/repositories/order-events.ts")).not.toMatch(/setInterval|setTimeout|select /i);
  });

  it("keeps live status separate from the notification providers", () => {
    for (const file of [...live.slice(0, 2), "src/server/services/order-events.ts"]) {
      expect(read(file), file).not.toMatch(/from\s+["'](firebase|@\/server\/(integrations|notifications|services\/notifications))/);
    }
  });
});
