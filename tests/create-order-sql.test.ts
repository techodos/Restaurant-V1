import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `createOrder` — the ONLY database work in the ordering flow (the tray is a browser cookie) — run through
 * its real code path against a recording fake transaction. Pins:
 *  - exactly one transaction: any repository helper that opened its own (the old nested restaurant /
 *    zones / coupon-usage reads) would be counted here;
 *  - three statements inside it for ANY order — one combined read, the order row, one combined write —
 *    whatever the number of lines, add-ons, delivery or coupon (plus begin/commit in `Database.transaction`);
 *  - the account rules: saved mobile wins, a first mobile is stored, an unverified email is refused — all
 *    read inside the transaction;
 *  - prices come from the menu rows, never from the request.
 */
const { db } = vi.hoisted(() => ({
  db: {
    transactions: 0,
    statements: [] as { sql: string; params: readonly unknown[] }[],
    /** the tea is flagged as a per-head dine-in buffet package */
    teaIsBuffet: false,
    /** the SAVE10 coupon's customer restriction (empty = open to everyone) */
    couponEligibleEmails: [] as string[],
    customer: {} as Record<string, unknown>,
    phoneTaken: false,
    /** restaurants.features.BranchingFeature */
    branching: false,
  },
}));

const RESTAURANT = "11111111-1111-4111-8111-111111111111";
const PIZZA = "22222222-2222-4222-8222-222222222222";
const MEDIUM = "33333333-3333-4333-8333-333333333333";
const CRUST = "44444444-4444-4444-8444-444444444444";
const STUFFED = "55555555-5555-4555-8555-555555555555";
const TEA = "66666666-6666-4666-8666-666666666666";

const menuRow = (id: string) =>
  id === PIZZA
    ? {
        id: PIZZA, restaurant_id: RESTAURANT, category_id: "cat", name: "Margherita", slug: "margherita", base_price: "950.00",
        is_active: true, is_available: true, prep_time_minutes: 20, availability: {}, category_active: true, category_availability: {},
        variant_rows: [{ id: MEDIUM, menu_item_id: PIZZA, name: "Medium", price: "1250.00", price_mode: "absolute", is_default: true, is_available: true, sort_order: 0 }],
        group_rows: [
          {
            id: CRUST, menu_item_id: PIZZA, name: "Crust", min_select: 0, max_select: 1, sort_order: 0, is_active: true,
            addons: [{ id: STUFFED, addon_group_id: CRUST, name: "Stuffed", price: "250.00", is_default: false, is_available: true, max_quantity: 1, sort_order: 0 }],
          },
        ],
      }
    : {
        id: TEA, restaurant_id: RESTAURANT, category_id: "cat", name: "Chai", slug: "chai", base_price: "180.00",
        is_active: true, is_available: true, prep_time_minutes: 5, availability: {}, category_active: true, category_availability: {},
        is_buffet_package: db.teaIsBuffet,
        variant_rows: [], group_rows: [],
      };

function answer(sql: string, params: readonly unknown[] = []): Record<string, unknown>[] {
  db.statements.push({ sql, params });
  const s = sql.replace(/\s+/g, " ").trim().toLowerCase();
  if (s.includes("row_to_json(r)")) {
    const ids = params[2] as string[];
    return [{
      restaurant: {
        id: RESTAURANT, name: "Bella", slug: "bella", status: "active", currency: "PKR", timezone: "Asia/Karachi",
        features: { onlineOrdering: true, delivery: true, pickup: true, coupons: true, BranchingFeature: db.branching }, settings: {},
      },
      branch: params[4] ? { id: params[4], city: "Islamabad", is_active: true } : null,
      customer: params[1] ? db.customer : null,
      menu: ids.filter((id) => id === PIZZA || id === TEA).map(menuRow),
      zones: params[3] ? [{ id: "zone-1", restaurant_id: RESTAURANT, location_id: "branch-1", branch_city: "Islamabad", name: "F-7", areas: ["F-7"], delivery_fee: 150, min_order_amount: 0, is_active: true }] : null,
      coupon:
        params[5] === "SAVE10"
          ? { id: "coupon-1", restaurant_id: RESTAURANT, code: "SAVE10", discount_type: "percentage", discount_value: 10, min_order_amount: 0, applies_to: "order", order_types: [], is_active: true, used_count: 0, phone_usage: 0, eligible_emails: db.couponEligibleEmails, eligible_phones: [] }
          : null,
    }];
  }
  if (s.startsWith("update customers set phone")) {
    if (db.phoneTaken) return [];
    db.customer = { ...db.customer, phone: params[1] };
    return [db.customer];
  }
  if (s.startsWith("insert into orders")) {
    return [{ id: "order-1", order_number: "ORD-1", restaurant_id: RESTAURANT, status: "pending", order_type: params[3], customer_phone: params[6], total: params[20], created_at: new Date() }];
  }
  if (s.startsWith("with order_lines as")) return [{ id: "payment-1" }];
  throw new Error(`unexpected SQL in fake: ${s.slice(0, 80)}`);
}

vi.mock("@/server/db/registry", () => {
  const nested = () => {
    throw new Error("createOrder opened a second transaction");
  };
  return {
    getDb: () => ({
      write: async (_ctx: unknown, handler: (tx: unknown) => Promise<unknown>) => {
        db.transactions += 1;
        return handler({
          query: async (sql: string, params?: readonly unknown[]) => answer(sql, params),
          queryOne: async (sql: string, params?: readonly unknown[]) => answer(sql, params)[0] ?? null,
        });
      },
      read: nested,
      asRuntime: nested,
      query: nested,
      queryOne: nested,
    }),
  };
});

import { createOrder, type CreateOrderInput } from "@/server/repositories/orders";

function input(lines: number, overrides: Partial<CreateOrderInput> = {}): CreateOrderInput {
  return {
    restaurantId: RESTAURANT,
    lines: Array.from({ length: lines }, (_, index) =>
      index % 2 === 0
        ? { menuItemId: PIZZA, variantId: MEDIUM, quantity: 2, addons: [{ addonId: STUFFED, quantity: 1 }] }
        : { menuItemId: TEA, variantId: null, quantity: 1, addons: [] },
    ),
    orderType: "pickup",
    customer: { fullName: "Noor", phone: "+923001112222", email: "typed@example.com" },
    paymentMethod: "cash",
    accountCustomerId: "cust-1",
    saveAccountPhone: true,
    requireVerifiedEmail: true,
    customerId: "cust-1",
    ...overrides,
  };
}

const statementsMatching = (pattern: RegExp) => db.statements.filter((statement) => pattern.test(statement.sql));
const writes = () => statementsMatching(/^\s*(insert|update|with)/i);

describe("createOrder — the single order transaction", () => {
  beforeEach(() => {
    db.transactions = 0;
    db.statements = [];
    db.phoneTaken = false;
    db.teaIsBuffet = false;
    db.couponEligibleEmails = [];
    db.branching = false;
    db.customer = { id: "cust-1", restaurant_id: RESTAURANT, full_name: "Noor", phone: "+923334445555", email: "noor@example.com", is_email_verified: true, created_at: new Date() };
  });

  it("does everything in exactly one transaction", async () => {
    const result = await createOrder(input(3), { customerId: "cust-1" });
    expect(db.transactions).toBe(1);
    expect(result.order.orderNumber).toBe("ORD-1");
    expect(result.paymentId).toBe("payment-1");
  });

  it("uses three statements for any order: 1 line or 12, pickup or delivery with a coupon", async () => {
    await createOrder(input(1), {});
    expect(db.statements).toHaveLength(3);
    db.statements = [];
    await createOrder(input(12), {});
    expect(db.statements).toHaveLength(3);
    db.statements = [];
    await createOrder(input(12, { orderType: "delivery", paymentMethod: "cash_on_delivery", address: { line1: "House 1", area: "F-7", city: "Islamabad" }, couponCode: "SAVE10" }), {});
    expect(db.statements).toHaveLength(3);
  });

  it("writes every line, add-on and the payment in one statement, priced from the menu rows", async () => {
    await createOrder(
      input(2, {
        lines: [
          { menuItemId: PIZZA, variantId: MEDIUM, quantity: 2, addons: [{ addonId: STUFFED, quantity: 1 }] },
          { menuItemId: TEA, variantId: null, quantity: 3, addons: [] },
        ],
      }),
      {},
    );
    const [write] = statementsMatching(/^\s*with order_lines as/i);
    expect(write!.sql).toMatch(/insert into order_items/);
    expect(write!.sql).toMatch(/insert into order_item_addons/);
    expect(write!.sql).toMatch(/insert into payments/);
    // pizza: unit 1250.00, add-ons 250.00, line (1250 + 250) × 2; chai: 180.00 × 3
    expect(write!.params.slice(8, 11)).toEqual(["1250.00", "250.00", "3000.00"]);
    expect(write!.params.slice(21, 24)).toEqual(["180.00", "0.00", "540.00"]);
    // each line carries its place in the tray (0028): lines share created_at, so this is the sort key
    expect(write!.params[12]).toBe(0);
    expect(write!.params[25]).toBe(1);
    expect(write!.params[26]).toBe(write!.params[0]); // the add-on points at its own line's generated id
    expect(write!.params[32]).toBe(0); // and has its place within that line
  });

  it("uses the account's saved mobile and email over what the form sent", async () => {
    await createOrder(input(1), {});
    const [order] = statementsMatching(/insert into orders/);
    expect(order!.params[5]).toBe("noor@example.com");
    expect(order!.params[6]).toBe("+923334445555");
    expect(statementsMatching(/update customers set phone/)).toHaveLength(0);
  });

  it("stores the entered mobile on an account that has none — one extra statement, only once the order is valid", async () => {
    db.customer = { ...db.customer, phone: "" };
    await createOrder(input(1), {});
    expect(statementsMatching(/update customers set phone/)).toHaveLength(1);
    expect(statementsMatching(/insert into orders/)[0]!.params[6]).toBe("+923001112222");
  });

  it("refuses a mobile another customer already has, before the order is written", async () => {
    db.customer = { ...db.customer, phone: "" };
    db.phoneTaken = true;
    await expect(createOrder(input(1), {})).rejects.toMatchObject({ code: "CONFLICT" });
    expect(statementsMatching(/insert into orders/)).toHaveLength(0);
  });

  it("refuses an unverified email before writing anything", async () => {
    db.customer = { ...db.customer, is_email_verified: false };
    await expect(createOrder(input(1), {})).rejects.toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
    expect(writes()).toHaveLength(0);
  });

  it("refuses when the signed-in account is not this restaurant's (or no longer exists)", async () => {
    await expect(createOrder(input(1, { accountCustomerId: "someone-else" }), {})).resolves.toBeTruthy(); // fake returns the row for any id…
    db.statements = [];
    const original = db.customer;
    db.customer = null as never; // …so model the database finding nothing
    await expect(createOrder(input(1), {})).rejects.toMatchObject({ code: "SIGN_IN_REQUIRED" });
    expect(writes()).toHaveLength(0);
    db.customer = original;
  });

  it("refuses a line whose item is not on the menu before writing anything", async () => {
    await expect(
      createOrder(input(1, { lines: [{ menuItemId: "77777777-7777-4777-8777-777777777777", variantId: null, quantity: 1, addons: [] }] }), {}),
    ).rejects.toMatchObject({ code: "ITEM_UNAVAILABLE" });
    expect(writes()).toHaveLength(0);
  });

  it("reads zones and the coupon (usage counted against the account's own phone) in the same read", async () => {
    await createOrder(
      input(2, { orderType: "delivery", paymentMethod: "cash_on_delivery", address: { line1: "House 1", area: "F-7", city: "Islamabad" }, couponCode: "SAVE10" }),
      {},
    );
    const [read] = statementsMatching(/row_to_json\(r\)/);
    expect(read!.sql).toMatch(/from delivery_zones/);
    expect(read!.sql).toMatch(/from coupons c/);
    expect(read!.sql).toMatch(/for update/);
    expect(read!.sql).toMatch(/coalesce\(nullif\(trim\(\(select phone from customers where id = \$2\)\), ''\), \$7\)/);
    const [write] = statementsMatching(/^\s*with order_lines as/i);
    expect(write!.sql).toMatch(/insert into deliveries/);
    expect(write!.sql).toMatch(/update coupons set used_count = used_count \+ 1/);
  });

  it("refuses a dine-in buffet package outside dine-in before writing anything", async () => {
    db.teaIsBuffet = true; // input(2) = a pizza and a tea
    await expect(createOrder(input(2), {})).rejects.toMatchObject({ code: "BUFFET_REQUIRES_DINE_IN" });
    expect(writes()).toHaveLength(0);
  });

  it("checks a customer-restricted coupon against the account's own email", async () => {
    const delivery = { orderType: "delivery" as const, paymentMethod: "cash_on_delivery" as const, address: { line1: "House 1", area: "F-7", city: "Islamabad" }, couponCode: "SAVE10" };
    db.couponEligibleEmails = ["someone-else@example.com"];
    await expect(createOrder(input(1, delivery), {})).rejects.toMatchObject({ code: "COUPON_INVALID" });
    expect(writes()).toHaveLength(0);
    db.couponEligibleEmails = ["noor@example.com"]; // db.customer's email
    await expect(createOrder(input(1, delivery), {})).resolves.toBeTruthy();
  });

  it("refuses an empty tray without opening a transaction", async () => {
    await expect(createOrder(input(0), {})).rejects.toMatchObject({ code: "CART_EMPTY" });
    expect(db.transactions).toBe(0);
  });
});

describe("createOrder — the order always has the branch that cooks it", () => {
  const delivery = { orderType: "delivery" as const, paymentMethod: "cash_on_delivery" as const, address: { line1: "House 1", area: "F-7", city: "Islamabad" } };
  beforeEach(() => {
    db.transactions = 0;
    db.statements = [];
    db.branching = false;
    db.customer = { id: "cust-1", restaurant_id: RESTAURANT, full_name: "Noor", phone: "+923334445555", email: "noor@example.com", is_email_verified: true, created_at: new Date() };
  });
  const orderInsert = () => statementsMatching(/^\s*insert into orders/i)[0];

  it("multi-branch ordering: refuses an order whose cart names no branch (stale / edited cookie), whatever the order type", async () => {
    db.branching = true;
    await expect(createOrder(input(1, { ...delivery, locationId: null }), { restaurantId: RESTAURANT })).rejects.toMatchObject({ code: "BRANCH_UNAVAILABLE" });
    await expect(createOrder(input(1, { locationId: null }), { restaurantId: RESTAURANT })).rejects.toMatchObject({ code: "BRANCH_UNAVAILABLE" });
    expect(orderInsert()).toBeUndefined();
  });

  it("multi-branch ordering: the named branch is the order's branch", async () => {
    db.branching = true;
    await createOrder(input(1, { ...delivery, locationId: "branch-1" }), { restaurantId: RESTAURANT });
    expect(orderInsert()!.params[1]).toBe("branch-1");
  });

  it("no branch named (single-location restaurant): a delivery records the branch whose zone delivers it, never null", async () => {
    await createOrder(input(1, { ...delivery, locationId: null }), { restaurantId: RESTAURANT });
    expect(orderInsert()!.params[1]).toBe("branch-1");
  });

  it("no branch named and not delivery: unchanged (no branch to infer)", async () => {
    await createOrder(input(1, { locationId: null }), { restaurantId: RESTAURANT });
    expect(orderInsert()!.params[1]).toBeNull();
  });
});
