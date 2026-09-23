import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFcmProvider } from "@/server/integrations/fcm";
import { createResendProvider } from "@/server/integrations/resend";
import type { NotificationEventRecord } from "@/server/notifications/types";
import { generateKeyPairSync } from "node:crypto";

/**
 * How dispatch calls are controlled inside one server process: one dispatcher per
 * restaurant, a cap on dispatchers overall, a drain loop for the scheduler, and an
 * email send rate under the provider's limit.
 */

const claimState = vi.hoisted(() => ({
  calls: [] as { restaurantId: string | null; limit: number }[],
  active: 0,
  maxActive: 0,
  delayMs: 20,
  /** how many full batches remain per call sequence (drain tests) */
  fullBatches: 0,
}));

vi.mock("@/server/config", () => ({
  config: {
    email: { resend: null, fromAddress: "a@b.co", maxPerSecond: 2 },
    push: { fcm: null, web: null },
    app: { siteUrl: "https://shop.example.com" },
    notifications: { maxAgeHours: 24, dispatchSecret: null },
  },
}));

vi.mock("@/server/repositories/notifications", () => ({
  claimDueNotificationEvents: async (options: { limit: number; restaurantId?: string | null }) => {
    claimState.calls.push({ restaurantId: options.restaurantId ?? null, limit: options.limit });
    claimState.active += 1;
    claimState.maxActive = Math.max(claimState.maxActive, claimState.active);
    await new Promise((resolve) => setTimeout(resolve, claimState.delayMs));
    claimState.active -= 1;
    if (claimState.fullBatches > 0) {
      claimState.fullBatches -= 1;
      return Array.from({ length: options.limit }, (_, i): NotificationEventRecord => ({
        id: `e${claimState.calls.length}-${i}`, restaurantId: "r", orderId: "o", customerId: null, eventType: "placed",
        attempts: 1, emailState: null, pushState: null,
      }));
    }
    return [];
  },
  loadNotificationOrderContext: async () => null, // -> event is retired, no provider is touched
  loadNotificationReservationContext: async () => null,
  saveNotificationOutcome: async () => undefined,
  listActivePushTokens: async () => [],
  deactivatePushTokens: async () => undefined,
  upsertPushToken: async () => undefined,
}));

import { dispatchDueNotifications, drainDueNotifications } from "@/server/services/notifications";

beforeEach(() => {
  claimState.calls = [];
  claimState.active = 0;
  claimState.maxActive = 0;
  claimState.delayMs = 20;
  claimState.fullBatches = 0;
});

describe("one dispatcher per restaurant", () => {
  it("a burst of calls for the same restaurant runs one dispatcher plus one re-run, and every caller resolves", async () => {
    const first = dispatchDueNotifications({ restaurantId: "r1" }, { restaurantId: "r1" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const rest = Array.from({ length: 30 }, () => dispatchDueNotifications({ restaurantId: "r1" }, { restaurantId: "r1" }));
    await Promise.all([first, ...rest]);

    // pass 1 (already running) + a single re-run that covers every call that arrived meanwhile
    expect(claimState.calls).toHaveLength(2);
    expect(claimState.maxActive).toBe(1);
  });

  it("a call that arrives while a dispatcher runs still gets a pass that starts after it", async () => {
    const first = dispatchDueNotifications({ restaurantId: "r1" }, { restaurantId: "r1" });
    await new Promise((resolve) => setTimeout(resolve, 10)); // pass 1 is mid-claim
    const late = dispatchDueNotifications({ restaurantId: "r1" }, { restaurantId: "r1" });
    await Promise.all([first, late]);
    expect(claimState.calls).toHaveLength(2);
  });

  it("does not start a new dispatcher once the previous one has finished", async () => {
    await dispatchDueNotifications({ restaurantId: "r1" }, { restaurantId: "r1" });
    await dispatchDueNotifications({ restaurantId: "r1" }, { restaurantId: "r1" });
    expect(claimState.calls).toHaveLength(2);
  });

  it("different restaurants run in parallel but never more than 3 dispatchers at once", async () => {
    const all = Array.from({ length: 12 }, (_, i) => dispatchDueNotifications({ restaurantId: `r${i}` }, { restaurantId: `r${i}` }));
    await Promise.all(all);
    expect(claimState.calls).toHaveLength(12); // nobody is skipped
    expect(claimState.maxActive).toBeGreaterThan(1);
    expect(claimState.maxActive).toBeLessThanOrEqual(3);
  });
});

describe("drain (scheduler route)", () => {
  it("keeps claiming full batches until the queue is empty", async () => {
    claimState.delayMs = 1;
    claimState.fullBatches = 3;
    const summary = await drainDueNotifications({ limit: 20, budgetMs: 10_000 });
    expect(claimState.calls).toHaveLength(4); // 3 full batches + the empty one that ends it
    expect(summary.claimed).toBe(60);
  });

  it("stops at once when the first batch is short", async () => {
    claimState.delayMs = 1;
    await drainDueNotifications({ limit: 20 });
    expect(claimState.calls).toHaveLength(1);
  });

  it("stops starting batches when the time budget is spent", async () => {
    claimState.delayMs = 30;
    claimState.fullBatches = 1000;
    await drainDueNotifications({ limit: 5, budgetMs: 120 });
    expect(claimState.calls.length).toBeGreaterThan(1);
    expect(claimState.calls.length).toBeLessThan(20);
  });

  it("is not affected by a concurrent scoped dispatcher's batch size", async () => {
    claimState.delayMs = 1;
    claimState.fullBatches = 2;
    const scoped = dispatchDueNotifications({ limit: 5, restaurantId: "r1" }, { restaurantId: "r1" });
    const summary = await drainDueNotifications({ limit: 20, budgetMs: 10_000 });
    await scoped;
    expect(summary.claimed).toBeGreaterThan(0);
    expect(claimState.calls.every((call) => call.limit === 5 || call.limit === 20)).toBe(true);
  });
});

describe("email send rate", () => {
  it("spreads a burst so that no more than the configured rate is sent per second", async () => {
    const times: number[] = [];
    const fetchMock = vi.fn(async () => {
      times.push(Date.now());
      return new Response(JSON.stringify({ id: "x" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = createResendProvider({ apiKey: "k", fromAddress: "a@b.co", maxPerSecond: 10 }); // 100 ms apart
    const message = { to: "a@b.co", fromName: "R", subject: "s", html: "h", text: "t", idempotencyKey: "k" };
    await Promise.all(Array.from({ length: 5 }, () => provider.send(message)));
    vi.unstubAllGlobals();

    expect(times).toHaveLength(5);
    for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(85);
  });
});

describe("push de-duplication key", () => {
  it("is sent as the web notification tag so a repeat replaces the earlier one on the device", async () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      if (url.includes("oauth2")) return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }), { status: 200 });
      bodies.push(JSON.parse(init.body as string));
      return new Response("{}", { status: 200 });
    });
    const provider = createFcmProvider({ projectId: "p", clientEmail: "svc@p.iam.gserviceaccount.com", privateKey });
    await provider.send(["t1"], { title: "t", body: "b", link: "https://x.test", data: {}, dedupeKey: "order-1-ready" });
    await provider.send(["t1"], { title: "t", body: "b", link: "https://x.test", data: {} });
    vi.unstubAllGlobals();

    type Sent = { message: { webpush: { notification: { title: string; body: string; tag?: string } } } };
    const withKey = (bodies[0] as Sent).message.webpush;
    const without = (bodies[1] as Sent).message.webpush;
    expect(withKey.notification.tag).toBe("order-1-ready");
    expect(without.notification.tag).toBeUndefined();
    // the worker displays the notification from this object, so it always carries the text
    expect(without.notification).toMatchObject({ title: "t", body: "b" });
  });
});
