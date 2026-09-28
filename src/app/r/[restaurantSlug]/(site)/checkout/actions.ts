"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { ApiResult } from "@/shared/contract/api";
import { action } from "@/server/errors";
import { placeOrder, type PlaceOrderResult } from "@/server/services/checkout";
import { dispatchDueNotifications } from "@/server/services/notifications";
import { assertCanPlaceOrder } from "@/server/services/customer-auth";
import { placeOrderSchema } from "@/server/validation/checkout";
import { getVisitorContext } from "@/web/session";
import { clearTray, readTray, requireStorefront } from "@/web/storefront";

export type { PlaceOrderResult };

/**
 * Checkout for signed-in, email-verified customers — the ONE database transaction of the whole ordering
 * flow. Restaurant (snapshot), customer (signed session cookie) and tray (its own cookie) cost nothing
 * to read; `placeOrder` → `createOrder` then re-reads everything that decides money or permission
 * (restaurant settings, the customer's verification, the menu, zones, coupon) inside that transaction.
 */
export async function placeOrderAction(slug: string, payload: unknown): Promise<ApiResult<PlaceOrderResult>> {
  return action(async () => {
    const input = placeOrderSchema.parse(payload);
    const context = await requireStorefront(slug);
    const { restaurant } = context;
    const visitor = await getVisitorContext(restaurant.id);
    // Only signed-in customers may order (enforced here and again in the transaction; hiding the
    // checkout for guests is only UX). Email verification is checked inside the order transaction.
    assertCanPlaceOrder(visitor);
    const tray = await readTray(context);
    const result = await placeOrder(restaurant, tray, input, visitor);
    await clearTray(slug); // the order consumed the tray
    revalidatePath(`/r/${slug}`, "layout");

    // The order is committed (and its "placed" event queued by the database). No email goes out
    // for a placed order; the confirmation email is sent when staff confirm it. Draining the
    // outbox here just closes the "placed" event after the response; it never affects the result.
    after(() => dispatchDueNotifications({ restaurantId: restaurant.id }, { restaurantId: restaurant.id }));
    return result;
  });
}
