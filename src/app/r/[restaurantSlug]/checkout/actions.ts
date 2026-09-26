"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { ApiResult } from "@/shared/contract/api";
import { action } from "@/server/errors";
import { placeOrder, type PlaceOrderResult } from "@/server/services/checkout";
import { dispatchDueNotifications } from "@/server/services/notifications";
import { requireRestaurant } from "@/server/services/restaurants";
import { assertCanPlaceOrder } from "@/server/services/customer-auth";
import { placeOrderSchema } from "@/server/validation/checkout";
import { getVisitorContext, setCartCountHint } from "@/web/session";

export type { PlaceOrderResult };

/** Checkout for signed-in, email-verified customers: parse input, check the customer, delegate to the checkout service. */
export async function placeOrderAction(slug: string, payload: unknown): Promise<ApiResult<PlaceOrderResult>> {
  return action(async () => {
    const input = placeOrderSchema.parse(payload);
    const restaurant = await requireRestaurant(slug);
    const visitor = await getVisitorContext(restaurant.id);
    // Only signed-in customers with a verified email may order (enforced here, server-side; hiding the
    // checkout for guests is only UX). See server/services/customer-auth.ts#assertCanPlaceOrder.
    await assertCanPlaceOrder(visitor);
    const result = await placeOrder(restaurant, input, visitor);
    await setCartCountHint(0); // the order consumed the cart
    revalidatePath(`/r/${slug}`, "layout");

    // The order is committed (and its "placed" event queued by the database). No email goes out
    // for a placed order; the confirmation email is sent when staff confirm it. Draining the
    // outbox here just closes the "placed" event after the response; it never affects the result.
    after(() => dispatchDueNotifications({ restaurantId: restaurant.id }, { restaurantId: restaurant.id }));
    return result;
  });
}
