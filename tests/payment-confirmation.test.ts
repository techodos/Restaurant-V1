import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * confirmOnlinePayment is called by the Stripe return route, the Stripe webhook and the JazzCash return — often
 * more than once for one payment. A failure may only resolve a pending payment; a verified success also resolves a
 * failed one (money was taken); nothing overwrites a paid payment.
 */
const { state } = vi.hoisted(() => ({ state: { status: "pending" as string, writes: [] as string[] } }));

vi.mock("@/server/repositories/orders", () => ({
  createOrder: vi.fn(),
  getOrderForAccessGrant: async () => ({ id: "order-1", payment: { status: state.status } }),
  setOrderPaymentStatus: async (_id: string, status: string) => {
    state.writes.push(status);
    state.status = status;
  },
}));

import { confirmOnlinePayment } from "@/server/services/checkout";

const confirm = (success: boolean) =>
  confirmOnlinePayment("r-1", "ABCD-EFGHJ", "order-1", { success, transactionId: "t", failureReason: success ? null : "declined" });

beforeEach(() => {
  state.status = "pending";
  state.writes = [];
});

describe("confirmOnlinePayment", () => {
  it("resolves a pending payment either way, once", async () => {
    await confirm(true);
    await confirm(true); // the webhook after the return route
    expect(state.writes).toEqual(["paid"]);
  });

  it("a later failure never overwrites a paid payment", async () => {
    await confirm(true);
    await confirm(false);
    expect(state.status).toBe("paid");
  });

  it("a verified success after a failed attempt marks the order paid", async () => {
    await confirm(false);
    await confirm(true);
    expect(state.writes).toEqual(["failed", "paid"]);
  });

  it("a repeated failure is written once", async () => {
    await confirm(false);
    await confirm(false);
    expect(state.writes).toEqual(["failed"]);
  });
});
