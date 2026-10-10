import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createOrder } from "@/server/repositories/orders";
import { getMenuItem } from "@/server/repositories/menu";
import { changePaymentStatus } from "@/server/services/orders";
import { manualPaymentTargets } from "@/shared/payment-flow";
import { ANON, BELLA, BELLA_OPEN_NOW, MANAGER, OWNER, SAKURA_OWNER, testDatabase } from "./helpers/db";
import type { PaymentMethod } from "@/shared/contract/enums";

describe("which payment changes staff may make (shared/payment-flow)", () => {
  it("offline methods only, along the allowed transitions", () => {
    expect(manualPaymentTargets("cash_on_delivery", "pending")).toEqual(["paid", "failed"]);
    expect(manualPaymentTargets("cash", "paid")).toEqual(["refunded", "pending"]);
    expect(manualPaymentTargets("card_terminal", "failed")).toEqual(["paid", "pending"]);
    expect(manualPaymentTargets("bank_transfer", "refunded")).toEqual([]);
    expect(manualPaymentTargets("card_online", "pending")).toEqual([]);
    expect(manualPaymentTargets("wallet", "paid")).toEqual([]);
  });
});

/** Against a real (local) Postgres: RLS, the branch write guard and the conditional update. */
describe("changePaymentStatus", () => {
  const restaurantId = BELLA.restaurantId;
  let pizzaId = "";
  let variantId = "";

  beforeAll(async () => {
    const pizza = await getMenuItem(restaurantId, { slug: "margherita-pizza" }, ANON, { includeUnavailable: true });
    if (!pizza) throw new Error("seed menu items missing — run npm run db:seed");
    pizzaId = pizza.id;
    variantId = pizza.variants[0]!.id;
  });
  afterAll(async () => {
    await testDatabase.end();
  });

  async function order(locationId: string, paymentMethod: PaymentMethod = "cash") {
    const phone = `+9232${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
    const { order: placed } = await createOrder(
      {
        restaurantId,
        lines: [{ menuItemId: pizzaId, variantId, quantity: 1, addons: [] }],
        locationId,
        orderType: "pickup",
        customer: { fullName: "Pay Test", phone, email: `pay-${randomUUID().slice(0, 8)}@example.com` },
        paymentMethod,
        now: BELLA_OPEN_NOW,
      },
      ANON,
    );
    return placed;
  }
  const paymentOf = async (orderId: string) =>
    testDatabase.write({}, (tx) =>
      tx.queryOne<{ status: string; paid_at: Date | null; order_status: string }>(
        `select p.status, p.paid_at, o.payment_status as order_status from payments p join orders o on o.id = p.order_id where p.order_id = $1`,
        [orderId],
      ),
    );

  it("marks a cash payment paid (payment row + order), then refunded", async () => {
    const placed = await order(BELLA.locationGulberg);
    await changePaymentStatus(placed.id, "paid", OWNER);
    const paid = await paymentOf(placed.id);
    expect(paid).toMatchObject({ status: "paid", order_status: "paid" });
    expect(paid?.paid_at).not.toBeNull();

    await changePaymentStatus(placed.id, "refunded", OWNER);
    expect(await paymentOf(placed.id)).toMatchObject({ status: "refunded", order_status: "refunded" });
    // refunded is final
    await expect(changePaymentStatus(placed.id, "paid", OWNER)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("two staff marking the same payment at once: one succeeds, the other is told it changed", async () => {
    const placed = await order(BELLA.locationGulberg);
    const outcomes = await Promise.allSettled([changePaymentStatus(placed.id, "paid", OWNER), changePaymentStatus(placed.id, "failed", OWNER)]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    const status = (await paymentOf(placed.id))!.status;
    expect(["paid", "failed"]).toContain(status);
  });

  it("refuses: another branch's order for a branch manager, another restaurant's owner", async () => {
    const dha = await order(BELLA.locationDha);
    // the manager is scoped to Gulberg: RLS hides the DHA order (not found), nothing changes
    await expect(changePaymentStatus(dha.id, "paid", MANAGER)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(changePaymentStatus(dha.id, "paid", SAKURA_OWNER)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await paymentOf(dha.id))!.status).toBe("pending");
    // the Gulberg manager can do their own branch
    const gulberg = await order(BELLA.locationGulberg);
    await changePaymentStatus(gulberg.id, "paid", { ...MANAGER, restaurantId });
    expect((await paymentOf(gulberg.id))!.status).toBe("paid");
  });
});
