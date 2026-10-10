import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createOrder, type CreateOrderInput } from "@/server/repositories/orders";
import { getMenuItem } from "@/server/repositories/menu";
import { ANON, BELLA, BELLA_OPEN_NOW, testDatabase } from "./helpers/db";
import type { MenuItem } from "@/shared/contract/models";

/**
 * Concurrency guarantees of the ONE order transaction, against a real (local) Postgres:
 *  - a retried or doubled "Place order" (same idempotency key) never creates a second order (0033);
 *  - a promo code's total usage limit holds when many customers redeem it at the same moment.
 */

const restaurantId = BELLA.restaurantId;
let pizza: MenuItem;

beforeAll(async () => {
  const item = await getMenuItem(restaurantId, { slug: "margherita-pizza" }, ANON, { includeUnavailable: true });
  if (!item) throw new Error("seed menu items missing — run npm run db:seed");
  pizza = item;
});

afterAll(async () => {
  await testDatabase.end();
});

/** A verified account customer, as checkout requires. */
async function newCustomer(): Promise<{ id: string; phone: string }> {
  const phone = `+9231${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
  const row = await testDatabase.write({}, (tx) =>
    tx.queryOne<{ id: string }>(
      `insert into customers (restaurant_id, full_name, email, phone, is_guest, is_email_verified, password_hash)
       values ($1, 'Load Tester', $2, $3, false, true, 'x') returning id`,
      [restaurantId, `idem-${randomUUID().slice(0, 8)}@example.com`, phone],
    ),
  );
  return { id: row!.id, phone };
}

function pickupOrder(customer: { id: string; phone: string }, extra: Partial<CreateOrderInput> = {}): CreateOrderInput {
  return {
    restaurantId,
    lines: [{ menuItemId: pizza.id, variantId: pizza.variants[0]!.id, quantity: 1, addons: [] }],
    locationId: BELLA.locationGulberg,
    orderType: "pickup",
    customer: { fullName: "Load Tester", phone: customer.phone },
    accountCustomerId: customer.id,
    customerId: customer.id,
    requireVerifiedEmail: true,
    paymentMethod: "cash",
    now: BELLA_OPEN_NOW,
    ...extra,
  };
}

async function ordersOf(customerId: string): Promise<number> {
  const row = await testDatabase.write({}, (tx) =>
    tx.queryOne<{ n: number }>("select count(*)::int as n from orders where customer_id = $1", [customerId]),
  );
  return row!.n;
}

describe("order idempotency", () => {
  it("a retried checkout returns the first order instead of placing another", async () => {
    const customer = await newCustomer();
    const key = randomUUID();
    const first = await createOrder(pickupOrder(customer, { idempotencyKey: key }), { customerId: customer.id });
    const retry = await createOrder(pickupOrder(customer, { idempotencyKey: key }), { customerId: customer.id });

    expect(first.replayed).toBe(false);
    expect(retry.replayed).toBe(true);
    expect(retry.order.id).toBe(first.order.id);
    expect(retry.order.orderNumber).toBe(first.order.orderNumber);
    expect(retry.paymentId).toBe(first.paymentId);
    expect(await ordersOf(customer.id)).toBe(1);
  });

  it("ten simultaneous submissions of one checkout create exactly one order", async () => {
    const customer = await newCustomer();
    const key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 10 }, () => createOrder(pickupOrder(customer, { idempotencyKey: key }), { customerId: customer.id })),
    );
    expect(new Set(results.map((result) => result.order.id)).size).toBe(1);
    expect(results.filter((result) => !result.replayed)).toHaveLength(1);
    expect(await ordersOf(customer.id)).toBe(1);
  });

  it("different keys (two real checkouts) are two orders; no key behaves as before", async () => {
    const customer = await newCustomer();
    await createOrder(pickupOrder(customer, { idempotencyKey: randomUUID() }), { customerId: customer.id });
    await createOrder(pickupOrder(customer, { idempotencyKey: randomUUID() }), { customerId: customer.id });
    await createOrder(pickupOrder(customer), { customerId: customer.id });
    expect(await ordersOf(customer.id)).toBe(3);
  });

  it("one customer's key never returns another customer's order", async () => {
    const [a, b] = [await newCustomer(), await newCustomer()];
    const key = randomUUID();
    const first = await createOrder(pickupOrder(a, { idempotencyKey: key }), { customerId: a.id });
    const second = await createOrder(pickupOrder(b, { idempotencyKey: key }), { customerId: b.id });
    expect(second.replayed).toBe(false);
    expect(second.order.id).not.toBe(first.order.id);
  });
});

describe("coupon usage limit under concurrency", () => {
  it("a code limited to 3 uses is redeemed exactly 3 times when 12 customers order at once", async () => {
    const code = `RACE${randomUUID().slice(0, 6).toUpperCase()}`;
    const coupon = await testDatabase.write({}, (tx) =>
      tx.queryOne<{ id: string }>(
        `insert into coupons (restaurant_id, code, discount_type, discount_value, usage_limit, is_active)
         values ($1, $2, 'fixed', 10, 3, true) returning id`,
        [restaurantId, code],
      ),
    );
    const customers = await Promise.all(Array.from({ length: 12 }, () => newCustomer()));
    const outcomes = await Promise.allSettled(
      customers.map((customer) => createOrder(pickupOrder(customer, { couponCode: code }), { customerId: customer.id })),
    );

    const placed = outcomes.filter((outcome) => outcome.status === "fulfilled");
    const refused = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
    expect(placed).toHaveLength(3);
    for (const outcome of refused) expect(String(outcome.reason?.message)).toMatch(/usage limit/i);

    const after = await testDatabase.write({}, (tx) =>
      tx.queryOne<{ used_count: number; orders: number }>(
        `select used_count, (select count(*)::int from orders where coupon_id = $1) as orders from coupons where id = $1`,
        [coupon!.id],
      ),
    );
    expect(after).toEqual({ used_count: 3, orders: 3 });
  });
});
