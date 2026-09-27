import { describe, expect, it, vi } from "vitest";
import type { RequestContext } from "@/server/context";

/**
 * A customer is identified to the database by customer_id only. app.current_user_id (auth.uid()) is for
 * staff: the order trigger writes it into order_status_history.changed_by, a FK to auth.users, so passing a
 * customer's id there failed every signed-in order with 23503. The database is mocked: we only capture the
 * session context the repositories open their write transaction with.
 */
const { sessions } = vi.hoisted(() => ({ sessions: [] as RequestContext[] }));
vi.mock("@/server/db/registry", () => ({
  getDb: () => ({
    write: async (context: RequestContext) => {
      sessions.push(context);
      throw new Error("stop after capturing the session");
    },
  }),
}));

import { createOrder } from "@/server/repositories/orders";
import { createReservation } from "@/server/repositories/reservations";
import { cancelOrderByCustomer } from "@/server/services/orders";

describe("customer identity in the database session", () => {
  it("createOrder: customer_id set, no auth user id", async () => {
    sessions.length = 0;
    await createOrder(
      { restaurantId: "r1", customerId: "cust-1", userId: "cust-1", customer: { fullName: "A" } } as never,
      { restaurantId: "r1", customerId: "cust-1", userId: "cust-1" },
    ).catch(() => undefined);
    expect(sessions[0]).toMatchObject({ restaurantId: "r1", customerId: "cust-1", userId: null });
  });

  it("createReservation: no auth user id", async () => {
    sessions.length = 0;
    await createReservation(
      { restaurantId: "r1", customerId: "cust-1", userId: "cust-1" } as never,
      { restaurantId: "r1", customerId: "cust-1", userId: "cust-1" },
    ).catch(() => undefined);
    expect(sessions[0]).toMatchObject({ restaurantId: "r1", customerId: "cust-1", userId: null });
  });

  it("cancelOrderByCustomer: no auth user id, even though the caller passed one", async () => {
    sessions.length = 0;
    const order = { id: "order-1", status: "pending", paymentMethod: "cash_on_delivery" } as never;
    const restaurant = {
      settings: {
        ordering: {
          customerCancellation: { enabled: true, allowedPaymentMethods: ["cash_on_delivery"], cutoffStatus: "pending" },
        },
      },
    } as never;
    await cancelOrderByCustomer(order, restaurant, { restaurantId: "r1", customerId: "cust-1", userId: "cust-1" }, null).catch(
      () => undefined,
    );
    expect(sessions[0]).toMatchObject({ restaurantId: "r1", customerId: "cust-1", userId: null });
  });
});
