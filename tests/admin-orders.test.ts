import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The admin order flow's database budget (each round trip is ~0.3 s on the hosted pooler, so these
 * counts ARE the speed): an order page, the kitchen screen, a status change and the orders list are
 * each ONE statement; the staff check and the restaurant/theme lookup are one statement and then served
 * from a short per-process cache — except a server action's staff check, which always re-reads.
 * The database is faked: it records every transaction and statement and answers by SQL shape.
 */
const { db } = vi.hoisted(() => ({
  db: {
    transactions: 0,
    statements: [] as { sql: string; params: readonly unknown[] }[],
    answer: (() => []) as (sql: string, params: readonly unknown[]) => Record<string, unknown>[],
  },
}));

vi.mock("@/server/db/registry", () => {
  const client = {
    query: async (sql: string, params: readonly unknown[] = []) => {
      db.statements.push({ sql, params });
      return db.answer(sql, params);
    },
    queryOne: async (sql: string, params: readonly unknown[] = []) => {
      db.statements.push({ sql, params });
      return db.answer(sql, params)[0] ?? null;
    },
    queryCount: async (sql: string, params: readonly unknown[] = []) => {
      db.statements.push({ sql, params });
      return Number(db.answer(sql, params)[0]?.count ?? 0);
    },
  };
  const transaction = async (_ctx: unknown, handler: (tx: typeof client) => Promise<unknown>) => {
    db.transactions += 1;
    return handler(client);
  };
  return {
    getDb: () => ({
      read: transaction,
      write: transaction,
      asRuntime: transaction,
      asService: transaction,
      query: (ctx: unknown, sql: string, params?: readonly unknown[]) => transaction(ctx, (tx) => tx.query(sql, params)),
      queryOne: (ctx: unknown, sql: string, params?: readonly unknown[]) => transaction(ctx, (tx) => tx.queryOne(sql, params)),
    }),
  };
});

import { getOrderByNumber, listKitchenOrders, listOrders, updateOrderStatus } from "@/server/repositories/orders";
import { authenticateStaff, invalidateStaffActors } from "@/server/auth/auth-service";
import { getAdminRestaurantContext, invalidateAdminRestaurants } from "@/server/services/restaurants";
import { ttlCache } from "@/server/cache/ttl";

const RESTAURANT = "11111111-1111-4111-8111-111111111111";
const ctx = { restaurantId: RESTAURANT, userId: "user-1", actor: "Owner" };

/** An order row as the single-statement read returns it: plain order columns + JSON relations. */
function orderRow(id: string, number: string, extra: Record<string, unknown> = {}) {
  return {
    id, restaurant_id: RESTAURANT, order_number: number, order_type: "pickup", status: "confirmed",
    customer_name: "Noor", customer_phone: "+923001234567", subtotal: "1250.00", total: "1250.00",
    discount_amount: "0", delivery_fee: "0", tax_amount: "0", service_fee: "0", tip_amount: "0",
    payment_method: "cash", payment_status: "pending", created_at: new Date("2026-10-01T10:00:00Z"), updated_at: new Date("2026-10-01T10:00:00Z"),
    location_name: "Main", delivery_zone_name: null,
    // JSON columns: numbers arrive as JSON numbers and timestamps as strings, unlike plain rows
    item_rows: [
      {
        id: `${id}-line-1`, order_id: id, item_name: "Margherita", variant_name: "Medium", quantity: 2,
        unit_price: 1250, addons_total: 150.5, line_total: 2801, image_url: "/m.jpg", slug: "margherita",
        created_at: "2026-10-01T10:00:00.123456+00:00",
        addon_rows: [{ id: "addon-1", order_item_id: `${id}-line-1`, group_name: "Crust", addon_name: "Stuffed", unit_price: 150.5, quantity: 1 }],
      },
    ],
    ...extra,
  };
}

beforeEach(() => {
  db.transactions = 0;
  db.statements = [];
  db.answer = () => [];
  invalidateStaffActors();
  invalidateAdminRestaurants();
});

describe("order reads are one statement", () => {
  it("reads an order page — order, items with add-ons, history, payment, delivery — in one statement", async () => {
    db.answer = () => [
      orderRow("order-1", "ORD-1", {
        history_rows: [
          { id: "h1", order_id: "order-1", from_status: null, to_status: "pending", changed_by_name: "customer", created_at: "2026-10-01T10:00:00+00:00" },
          { id: "h2", order_id: "order-1", from_status: "pending", to_status: "confirmed", changed_by_name: "Owner", note: null, created_at: "2026-10-01T10:05:00+00:00" },
        ],
        payment_row: { id: "pay-1", order_id: "order-1", provider: "cash", method: "cash", status: "pending", amount: 2801, currency: "PKR" },
        delivery_row: null,
      }),
    ];
    const order = await getOrderByNumber(RESTAURANT, "ORD-1", ctx);
    expect(db.transactions).toBe(1);
    expect(db.statements).toHaveLength(1);
    expect(order?.items).toEqual([
      expect.objectContaining({ itemName: "Margherita", quantity: 2, unitPrice: "1250.00", addonsTotal: "150.50", lineTotal: "2801.00", imageUrl: "/m.jpg" }),
    ]);
    expect(order?.items?.[0]?.addons).toEqual([expect.objectContaining({ addonName: "Stuffed", unitPrice: "150.50", quantity: 1 })]);
    expect(order?.statusHistory?.map((event) => event.toStatus)).toEqual(["pending", "confirmed"]);
    expect(order?.statusHistory?.[1]?.createdAt).toBe("2026-10-01T10:05:00.000Z");
    expect(order?.payment).toEqual(expect.objectContaining({ amount: "2801.00", status: "pending" }));
    expect(order?.delivery).toBeNull();
  });

  it("skips the relations entirely when details are not wanted", async () => {
    db.answer = () => [orderRow("order-1", "ORD-1")];
    const order = await getOrderByNumber(RESTAURANT, "ORD-1", ctx, { withDetails: false });
    expect(db.statements).toHaveLength(1);
    expect(db.statements[0]!.sql).not.toMatch(/order_item_addons|order_status_history/);
    expect(order?.items).toBeUndefined();
  });

  it("returns null for an unknown order number", async () => {
    expect(await getOrderByNumber(RESTAURANT, "NOPE", ctx)).toBeNull();
    expect(db.statements).toHaveLength(1);
  });

  it("reads the whole kitchen screen in one statement, however many tickets are open", async () => {
    db.answer = () => Array.from({ length: 25 }, (_, i) => orderRow(`order-${i}`, `ORD-${i}`));
    const orders = await listKitchenOrders(RESTAURANT, ctx);
    expect(orders).toHaveLength(25);
    expect(db.transactions).toBe(1);
    expect(db.statements).toHaveLength(1); // it was 1 + 2 per ticket = 51
    expect(orders[7]!.items?.[0]).toEqual(expect.objectContaining({ orderId: "order-7", itemName: "Margherita" }));
  });
});

describe("orders list", () => {
  it("returns the page and the total from one statement", async () => {
    db.answer = () => [
      { id: "o1", order_number: "ORD-1", status: "pending", order_type: "pickup", total: "10", created_at: new Date(), item_count: 1, item_preview: ["Tea"], total_count: "42" },
    ];
    const page = await listOrders(RESTAURANT, { status: "active", page: 1, pageSize: 20 }, ctx);
    expect(db.statements).toHaveLength(1);
    expect(db.statements[0]!.sql).toMatch(/count\(\*\) over \(\)/);
    expect(page.total).toBe(42);
    expect(page.rows[0]!.itemPreview).toEqual(["Tea"]);
  });

  it("an empty first page is a total of 0 without a second query", async () => {
    const page = await listOrders(RESTAURANT, { status: "all", page: 1, pageSize: 20 }, ctx);
    expect(page.total).toBe(0);
    expect(db.statements).toHaveLength(1);
  });

  it("a page past the end still reports the real total (it falls back to counting)", async () => {
    db.answer = (sql) => (/^select count\(\*\) from orders/.test(sql.trim()) ? [{ count: "7" }] : []);
    const page = await listOrders(RESTAURANT, { status: "all", page: 9, pageSize: 20 }, ctx);
    expect(page.total).toBe(7);
    expect(page.rows).toEqual([]);
    expect(db.statements).toHaveLength(2);
  });
});

describe("status change", () => {
  it("is one statement and reports only id, number and status", async () => {
    db.answer = () => [{ id: "order-1", order_number: "ORD-1", status: "preparing" }];
    const result = await updateOrderStatus("order-1", "preparing", ctx);
    expect(result).toEqual({ id: "order-1", orderNumber: "ORD-1", status: "preparing" });
    expect(db.transactions).toBe(1);
    expect(db.statements).toHaveLength(1); // it was 5: the update, then items, add-ons and history re-read
    expect(db.statements[0]!.sql).toMatch(/returning id, order_number, status/);
  });

  it("adds one statement only when a note is given, written onto the history row the trigger just made", async () => {
    db.answer = (sql) => (sql.includes("update orders") ? [{ id: "order-1", order_number: "ORD-1", status: "cancelled" }] : []);
    await updateOrderStatus("order-1", "cancelled", ctx, { note: "Out of stock", cancelReason: "Sold out" });
    expect(db.statements).toHaveLength(2);
    expect(db.statements[0]!.params).toEqual(["order-1", "cancelled", "Sold out"]);
    expect(db.statements[1]!.params).toEqual(["order-1", "Out of stock"]);
  });

  it("an unknown order is NOT_FOUND", async () => {
    await expect(updateOrderStatus("missing", "confirmed", ctx)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("staff check", () => {
  const session = { sub: "user-1", email: "o@example.com", name: "Owner", restaurantId: RESTAURANT, role: "owner" as const };
  const memberRow = {
    id: "member-1", restaurant_id: RESTAURANT, user_id: "user-1", email: "o@example.com", full_name: "Owner", role: "owner",
    permissions: {}, is_active: true, checked_restaurant_id: RESTAURANT, checked_restaurant_slug: "bella",
  };

  it("is one statement, then served from the cache for page views", async () => {
    db.answer = () => [memberRow];
    const first = await authenticateStaff(session, "bella");
    const second = await authenticateStaff(session, "bella");
    expect(first).toEqual(expect.objectContaining({ userId: "user-1", restaurantId: RESTAURANT, restaurantSlug: "bella", role: "owner" }));
    expect(second).toBe(first);
    expect(db.statements).toHaveLength(1); // it was a transaction of two statements, on every request
  });

  it("re-reads for writes (fresh), so a deactivated member is refused at once", async () => {
    db.answer = () => [memberRow];
    await authenticateStaff(session, "bella");
    db.answer = () => []; // deactivated meanwhile
    expect(await authenticateStaff(session, "bella", { fresh: true })).toBeNull();
    // and the fresh answer replaced the cached one for later page views too
    expect(await authenticateStaff(session, "bella")).toBeNull();
    expect(db.statements).toHaveLength(2);
  });

  it("a team write clears the cache", async () => {
    db.answer = () => [memberRow];
    await authenticateStaff(session, "bella");
    invalidateStaffActors();
    await authenticateStaff(session, "bella");
    expect(db.statements).toHaveLength(2);
  });

  it("refuses a session whose restaurant is not the one in the URL", async () => {
    db.answer = () => [{ ...memberRow, checked_restaurant_id: "22222222-2222-4222-8222-222222222222", checked_restaurant_slug: "other" }];
    expect(await authenticateStaff(session, "other")).toBeNull();
  });

  it("refuses when the URL names no restaurant at all", async () => {
    db.answer = () => [{ ...memberRow, checked_restaurant_id: null, checked_restaurant_slug: null }];
    expect(await authenticateStaff(session, "no-such-slug")).toBeNull();
  });

  it("caches per restaurant slug, so one tenant's answer is never reused for another", async () => {
    db.answer = () => [memberRow];
    await authenticateStaff(session, "bella");
    await authenticateStaff(session, "other-slug");
    expect(db.statements).toHaveLength(2);
    expect(db.statements[1]!.params).toEqual(["user-1", RESTAURANT, "other-slug"]);
  });
});

describe("admin restaurant + theme", () => {
  const row = { id: RESTAURANT, name: "Bella", slug: "bella", primary_color: "#aa3322", features: {}, settings: {}, website_theme: null };

  it("is one statement for both, then cached; `fresh` re-reads", async () => {
    db.answer = () => [row];
    const first = await getAdminRestaurantContext("bella");
    await getAdminRestaurantContext("bella");
    expect(db.statements).toHaveLength(1);
    expect(db.statements[0]!.sql).toMatch(/website_theme/);
    expect(first.restaurant.slug).toBe("bella");
    expect(first.theme).toBeTruthy();
    await getAdminRestaurantContext("bella", { fresh: true });
    expect(db.statements).toHaveLength(2);
  });

  it("an unknown slug is NOT_FOUND and is not cached", async () => {
    await expect(getAdminRestaurantContext("nope")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getAdminRestaurantContext("nope")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(db.statements).toHaveLength(2);
  });

  it("restaurant writes clear it", async () => {
    db.answer = () => [row];
    await getAdminRestaurantContext("bella");
    invalidateAdminRestaurants();
    await getAdminRestaurantContext("bella");
    expect(db.statements).toHaveLength(2);
  });
});

describe("ttlCache", () => {
  afterEach(() => vi.useRealTimers());

  it("expires entries after the TTL", async () => {
    vi.useFakeTimers();
    const cache = ttlCache<number>(`t-${Math.random()}`, 1000);
    const load = vi.fn(async () => 1);
    await cache.get("k", load);
    await cache.get("k", load);
    vi.advanceTimersByTime(1001);
    await cache.get("k", load);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("shares one in-flight load between concurrent callers", async () => {
    const cache = ttlCache<number>(`t-${Math.random()}`, 1000);
    const load = vi.fn(() => new Promise<number>((resolve) => setTimeout(() => resolve(5), 10)));
    const values = await Promise.all([cache.get("k", load), cache.get("k", load), cache.get("k", load)]);
    expect(values).toEqual([5, 5, 5]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not keep a failed load", async () => {
    const cache = ttlCache<number>(`t-${Math.random()}`, 1000);
    await expect(cache.get("k", async () => Promise.reject(new Error("db down")))).rejects.toThrow("db down");
    await expect(cache.get("k", async () => 3)).resolves.toBe(3);
  });

  it("bounds its size", async () => {
    const cache = ttlCache<number>(`t-${Math.random()}`, 60_000, 2);
    const load = vi.fn(async () => 1);
    await cache.get("a", load);
    await cache.get("b", load);
    await cache.get("c", load); // evicts "a"
    await cache.get("a", load);
    expect(load).toHaveBeenCalledTimes(4);
  });
});

describe("the status click renders the page once", () => {
  it("the control does not router.refresh() after the action (the action's response is the fresh page)", () => {
    const control = readFileSync("src/components/admin/order-status-control.tsx", "utf8");
    expect(control).not.toMatch(/router\.refresh\(\)/);
    expect(control).not.toMatch(/useRouter/);
  });

  it("the action revalidates every page that shows the status, so its response re-renders whichever is open", () => {
    const action = readFileSync("src/app/r/[restaurantSlug]/admin/(dashboard)/orders/actions.ts", "utf8");
    for (const path of ['"/orders"', "`/orders/${order.orderNumber}`", '"/kitchen"']) expect(action).toContain(path);
    expect(action).toMatch(/revalidatePath\(adminPath\(actor\.restaurantSlug\)\)/);
    expect(action).toMatch(/after\(\(\) => dispatchDueNotifications/);
  });

  it("server actions re-check staff membership; page views may use the cache", () => {
    const session = readFileSync("src/web/session.ts", "utf8");
    expect(session).toMatch(/headers\(\)\)\.has\("next-action"\)/);
    expect(session).toMatch(/authenticateStaff\(session, restaurantSlug, \{ fresh: await isServerActionRequest\(\) \}\)/);
  });
});
