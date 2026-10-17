import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createOrder, getOrderById, listOrders, updateOrderStatus, updateOrderStatuses } from "@/server/repositories/orders";
import { getMenuItem } from "@/server/repositories/menu";
import { ANON, BELLA, BELLA_OPEN_NOW, SAKURA_OWNER, testDatabase } from "./helpers/db";
import type { MenuItem } from "@/shared/contract/models";

/**
 * The orders list's bulk "next step" (one UPDATE for many orders) against the real test database: each row keeps the
 * single-change guards and triggers, a move that is no longer allowed is skipped (not a failed batch), and another
 * restaurant's staff move nothing. Plus the report/export date filter now bounded by the restaurant's local days.
 */
const owner = { userId: BELLA.userOwner, restaurantId: BELLA.restaurantId, actor: "Imran Chaudhry" };
let margherita: MenuItem;

beforeAll(async () => {
  const item = await getMenuItem(BELLA.restaurantId, { slug: "margherita-pizza" }, ANON, { includeUnavailable: true });
  if (!item) throw new Error("seed menu items missing — run npm run db:seed");
  margherita = item;
});

afterAll(async () => {
  await testDatabase.end();
});

async function placeOrder(label: string) {
  const { order } = await createOrder(
    {
      restaurantId: BELLA.restaurantId,
      now: BELLA_OPEN_NOW,
      lines: [{ menuItemId: margherita.id, variantId: margherita.variants[0]!.id, quantity: 1, addons: [] }],
      orderType: "pickup",
      customer: { fullName: `Bulk ${label}`, phone: `+92 300 20${String(Math.floor(Math.random() * 1e5)).padStart(5, "0")}` },
      paymentMethod: "cash",
    },
    ANON,
  );
  return order;
}

const eventsFor = (orderIds: string[]) =>
  testDatabase.asService({}, (tx) =>
    tx.query<{ order_id: string; event_type: string }>(`select order_id, event_type from notification_events where order_id = any($1::uuid[])`, [orderIds]),
  );

describe("bulk order status change", () => {
  it("moves every order to its own target in one call, with history and a notification per order", async () => {
    const [a, b, c] = await Promise.all([placeOrder("a"), placeOrder("b"), placeOrder("c")]);
    await updateOrderStatus(c.id, "confirmed", owner);

    const changed = await updateOrderStatuses(
      [
        { orderId: a.id, status: "confirmed" },
        { orderId: b.id, status: "confirmed" },
        { orderId: c.id, status: "preparing" },
      ],
      owner,
    );
    expect(changed.map((row) => [row.orderNumber, row.status]).sort()).toEqual(
      [[a.orderNumber, "confirmed"], [b.orderNumber, "confirmed"], [c.orderNumber, "preparing"]].sort(),
    );
    const reread = await getOrderById(c.id, owner);
    expect(reread?.statusHistory?.map((event) => event.toStatus)).toEqual(["pending", "confirmed", "preparing"]);
    const events = await eventsFor([a.id, b.id, c.id]);
    expect(events.filter((event) => event.event_type === "confirmed").map((event) => event.order_id).sort()).toEqual([a.id, b.id, c.id].sort());
    expect(events.some((event) => event.order_id === c.id && event.event_type === "preparing")).toBe(true);
  });

  it("skips orders whose move is no longer allowed instead of failing the whole batch", async () => {
    const [open, done, cancelled] = await Promise.all([placeOrder("open"), placeOrder("done"), placeOrder("cancelled")]);
    await updateOrderStatus(done.id, "completed", owner);
    await updateOrderStatus(cancelled.id, "cancelled", owner);

    const changed = await updateOrderStatuses(
      [
        { orderId: open.id, status: "confirmed" },
        { orderId: done.id, status: "confirmed" }, // finished: refused by the transition rule
        { orderId: cancelled.id, status: "preparing" }, // finished: refused
      ],
      owner,
    );
    expect(changed.map((row) => row.id)).toEqual([open.id]);
    expect((await getOrderById(done.id, owner))?.status).toBe("completed");
    expect((await getOrderById(cancelled.id, owner))?.status).toBe("cancelled");
    // a second click with the same (now stale) targets changes nothing
    expect(await updateOrderStatuses([{ orderId: open.id, status: "confirmed" }], owner)).toEqual([]);
  });

  it("another restaurant's staff cannot move these orders", async () => {
    const order = await placeOrder("foreign");
    expect(await updateOrderStatuses([{ orderId: order.id, status: "confirmed" }], SAKURA_OWNER)).toEqual([]);
    expect((await getOrderById(order.id, owner))?.status).toBe("pending");
  });
});

describe("order list date range uses the restaurant's local days", () => {
  it("an order at 01:00 Karachi time belongs to that Karachi day, not the previous UTC day", async () => {
    const order = await placeOrder("tz");
    // 2026-03-10 20:00 UTC = 2026-03-11 01:00 in Asia/Karachi (UTC+5)
    await testDatabase.asService({}, (tx) => tx.query(`update orders set created_at = '2026-03-10T20:00:00Z' where id = $1`, [order.id]));
    const inRange = (timezone: string, day: string) =>
      listOrders(BELLA.restaurantId, { dateFrom: day, dateTo: day, timezone, status: "all", search: order.orderNumber }, owner).then((result) =>
        result.rows.map((row) => row.id),
      );
    expect(await inRange("Asia/Karachi", "2026-03-11")).toEqual([order.id]);
    expect(await inRange("Asia/Karachi", "2026-03-10")).toEqual([]);
    expect(await inRange("UTC", "2026-03-10")).toEqual([order.id]);
  });
});
