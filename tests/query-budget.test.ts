import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Query budgets from the whole-project query pass (2026-10-04): every round trip is ~0.35 s on the hosted
 * pooler and response time grows with size, so these counts and column lists ARE the speed. The
 * database is faked: it records every transaction and statement and answers by SQL shape.
 */
const { db } = vi.hoisted(() => ({
  db: {
    transactions: 0,
    statements: [] as { sql: string; params: readonly unknown[] }[],
    answer: (() => []) as (sql: string, params: readonly unknown[]) => Record<string, unknown>[],
  },
}));

vi.mock("@/server/db/registry", () => {
  const record = (sql: string, params: readonly unknown[] = []) => {
    db.statements.push({ sql, params });
    return db.answer(sql, params);
  };
  const client = {
    query: async (sql: string, params?: readonly unknown[]) => record(sql, params),
    queryOne: async (sql: string, params?: readonly unknown[]) => record(sql, params)[0] ?? null,
    queryCount: async (sql: string, params?: readonly unknown[]) => Number(record(sql, params)[0]?.count ?? 0),
  };
  const transaction = async (_ctx: unknown, handler: (tx: typeof client) => Promise<unknown>) => {
    db.transactions += 1;
    return handler(client);
  };
  return {
    getDb: () => ({
      read: transaction, write: transaction, asRuntime: transaction, asService: transaction,
      query: (ctx: unknown, sql: string, params?: readonly unknown[]) => transaction(ctx, (tx) => tx.query(sql, params)),
      queryOne: (ctx: unknown, sql: string, params?: readonly unknown[]) => transaction(ctx, (tx) => tx.queryOne(sql, params)),
    }),
  };
});

import { countActiveVisitorOrders, getOrderForAccessGrant, getSalesAnalytics, listVisitorOrders } from "@/server/repositories/orders";
import { getCustomerById, listCustomers } from "@/server/repositories/customers";
import { reorderCategories, reorderMenuItems } from "@/server/repositories/menu";
import { listPayments } from "@/server/repositories/payments";
import { listReviews } from "@/server/repositories/reviews";
import { loadNotificationOrderContext } from "@/server/repositories/notifications";
import { getMyOrders } from "@/server/services/orders";

const RESTAURANT = "11111111-1111-4111-8111-111111111111";
const CUSTOMER = "33333333-3333-4333-8333-333333333333";
const staff = { restaurantId: RESTAURANT, userId: "u1", actor: "Owner" };

beforeEach(() => {
  db.transactions = 0;
  db.statements = [];
  db.answer = () => [];
});

describe("storefront layout: the active-order widget", () => {
  it("is one count(*) for a signed-in customer (it loaded full orders + items to count them)", async () => {
    db.answer = () => [{ count: "2" }];
    const count = await countActiveVisitorOrders(RESTAURANT, { customerId: CUSTOMER });
    expect(count).toBe(2);
    expect(db.statements).toHaveLength(1);
    expect(db.statements[0]!.sql).toMatch(/select count\(\*\) as count from orders o\s+where o.restaurant_id = \$1 and o.customer_id = \$2/);
    expect(db.statements[0]!.params[2]).toEqual(["pending", "confirmed", "preparing", "ready", "out_for_delivery"]);
  });

  it("costs nothing for a visitor with no identity, and uses the cart token for a guest", async () => {
    expect(await countActiveVisitorOrders(RESTAURANT, {})).toBe(0);
    expect(db.transactions).toBe(0);
    await countActiveVisitorOrders(RESTAURANT, { cartToken: "tok" });
    expect(db.statements[0]!.sql).toMatch(/join carts c on c.id = o.cart_id/);
    expect(db.statements[0]!.params[1]).toBe("tok");
  });

  it("the layout reads only the count", () => {
    const layout = readFileSync("src/app/r/[restaurantSlug]/(site)/layout.tsx", "utf8");
    expect(layout).toMatch(/getActiveOrderCount\(restaurant\.id, visitor\)/);
    expect(layout).not.toMatch(/getMyOrders/);
  });

  it("the current-orders page skips the order history", async () => {
    await getMyOrders(RESTAURANT, { customerId: CUSTOMER }, { history: false });
    expect(db.statements[0]!.params[3]).toBe(0); // historyLimit 0 → no past orders come back
    db.statements = [];
    await listVisitorOrders(RESTAURANT, { customerId: CUSTOMER });
    expect(db.statements[0]!.params[3]).toBe(20); // the orders page still gets its history
  });
});

describe("order reads without relations", () => {
  it("an access-link read can skip items/history/payment/delivery (the live stream needs four fields)", async () => {
    db.answer = () => [{ id: "o1", restaurant_id: RESTAURANT, order_number: "ORD-1", status: "preparing", payment_status: "paid" }];
    const order = await getOrderForAccessGrant(RESTAURANT, "ORD-1", "o1", { withDetails: false });
    expect(db.statements[0]!.sql).not.toMatch(/order_item_addons|order_status_history|payments|deliveries/);
    expect(order).toEqual(expect.objectContaining({ status: "preparing", paymentStatus: "paid" }));
    expect(order?.items).toBeUndefined();
  });

  it("the live order stream asks for the order row only", () => {
    const stream = readFileSync("src/server/services/order-events.ts", "utf8");
    expect(stream.match(/findVisitorOrder\([^)]*\{ withDetails: false \}\)/g)).toHaveLength(2);
  });

  it("a notification's order context is one statement with the items", async () => {
    db.answer = () => [{
      id: "o1", restaurant_id: RESTAURANT, order_number: "ORD-1", status: "confirmed", restaurant_name: "Bella",
      item_rows: [{ id: "l1", order_id: "o1", item_name: "Tea", quantity: 1, unit_price: 180, addons_total: 0, line_total: 180, addon_rows: [] }],
    }];
    const context = await loadNotificationOrderContext({ id: "e1", restaurantId: RESTAURANT, orderId: "o1", reservationId: null } as never);
    expect(db.statements).toHaveLength(1);
    expect(context?.order.items?.[0]).toEqual(expect.objectContaining({ itemName: "Tea", lineTotal: "180.00" }));
  });
});

describe("customer rows never carry login secrets", () => {
  it("customer reads select the mapped columns, not password_hash / google_sub", async () => {
    await getCustomerById(CUSTOMER, { customerId: CUSTOMER });
    const sql = db.statements[0]!.sql;
    expect(sql).not.toMatch(/\*/);
    expect(sql).not.toMatch(/password_hash|google_sub/);
    expect(sql).toMatch(/full_name/);
  });

  it("no `select *` / `returning *` is left on customers in the repository", () => {
    const repo = readFileSync("src/server/repositories/customers.ts", "utf8");
    expect(repo).not.toMatch(/(select \*|returning \*)[^`]*from customers/);
    expect(repo).not.toMatch(/update customers[^`]*returning \*/);
  });
});

describe("admin lists return the page and the total in one statement", () => {
  const cases: [string, () => Promise<{ total: number }>, string][] = [
    ["customers", () => listCustomers(RESTAURANT, { page: 1, pageSize: 20 } as never, staff), "from customers"],
    ["payments", () => listPayments(RESTAURANT, { status: "all", page: 1, pageSize: 20 } as never, staff), "from payments p"],
    ["reviews", () => listReviews(RESTAURANT, { status: "all", page: 1, pageSize: 20 } as never, staff), "from reviews r"],
  ];
  for (const [name, run, from] of cases) {
    it(name, async () => {
      db.answer = () => [{ id: "x1", restaurant_id: RESTAURANT, total_count: "41", created_at: new Date() }];
      const page = await run();
      expect(db.statements).toHaveLength(1);
      expect(db.statements[0]!.sql).toMatch(/count\(\*\) over \(\) as total_count/);
      expect(db.statements[0]!.sql).toContain(from);
      expect(page.total).toBe(41);
    });

    it(`${name}: a page past the end still reports the real total`, async () => {
      db.answer = (sql) => (/^select count\(\*\)/.test(sql.trim()) ? [{ count: "5" }] : []);
      const page = await (name === "customers"
        ? listCustomers(RESTAURANT, { page: 9, pageSize: 20 } as never, staff)
        : name === "payments"
          ? listPayments(RESTAURANT, { status: "all", page: 9, pageSize: 20 } as never, staff)
          : listReviews(RESTAURANT, { status: "all", page: 9, pageSize: 20 } as never, staff));
      expect(page.total).toBe(5);
    });
  }
});

describe("sales report", () => {
  it("is one statement and maps every breakdown as before", async () => {
    db.answer = () => [{
      summary: { total_orders: 5, completed_orders: 3, cancelled_orders: 1, total_sales: "4500.50", total_discounts: "100.00", avg_order_value: "1500.1666" },
      statuses: [{ status: "completed", count: 3 }, { status: "cancelled", count: 1 }, { status: "pending", count: 1 }],
      payments: [{ payment_method: "cash", orders: 3, amount: "4500.50" }],
      trend: [{ day: "2026-10-01", orders: 5, sales: "4500.50" }],
    }];
    const report = await getSalesAnalytics(RESTAURANT, { fromDateKey: "2026-10-01", toDateKey: "2026-10-01", timezone: "Asia/Karachi" }, staff);
    expect(db.statements).toHaveLength(1); // it was four queries in a row
    expect(report).toEqual(expect.objectContaining({
      totalSales: "4500.50", totalOrders: 5, completedOrders: 3, cancelledOrders: 1, activeOrders: 1,
      averageOrderValue: "1500.17", totalDiscounts: "100.00",
    }));
    expect(report.statusBreakdown).toEqual(expect.objectContaining({ completed: 3, cancelled: 1, pending: 1, ready: 0 }));
    expect(report.paymentBreakdown).toEqual([{ method: "cash", orders: 3, amount: "4500.50" }]);
    expect(report.dailyTrend).toEqual([{ date: "2026-10-01", orders: 5, sales: "4500.50" }]);
  });
});

describe("menu reorder", () => {
  it("sets every position in one statement (it was one UPDATE per item)", async () => {
    await reorderMenuItems(["a", "b", "c", "d"], staff);
    expect(db.statements).toHaveLength(1);
    expect(db.statements[0]!.sql).toMatch(/unnest\(\$1::uuid\[\], \$2::int\[\]\)/);
    expect(db.statements[0]!.params).toEqual([["a", "b", "c", "d"], [0, 1, 2, 3]]);
  });

  it("an id listed twice keeps its last position, as the old loop did; an empty list writes nothing", async () => {
    await reorderCategories(["a", "b", "a"], staff);
    expect(db.statements[0]!.params).toEqual([["a", "b"], [2, 1]]);
    db.statements = [];
    await reorderMenuItems([], staff);
    expect(db.statements).toHaveLength(0);
  });
});
