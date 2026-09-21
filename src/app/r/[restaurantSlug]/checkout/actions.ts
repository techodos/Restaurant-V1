"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { ApiResult } from "@/shared/contract/api";
import { action } from "@/server/errors";
import { placeOrder, type PlaceOrderResult } from "@/server/services/checkout";
import { dispatchDueNotifications } from "@/server/services/notifications";
import { requireRestaurant } from "@/server/services/restaurants";
import { placeOrderSchema } from "@/server/validation/checkout";
import { getVisitorContext } from "@/web/session";

export type { PlaceOrderResult };

/** Guest checkout: parse input, delegate to the checkout service. */
export async function placeOrderAction(slug: string, payload: unknown): Promise<ApiResult<PlaceOrderResult>> {
  return action(async () => {
    const input = placeOrderSchema.parse(payload);
    const restaurant = await requireRestaurant(slug);
    const visitor = await getVisitorContext(restaurant.id);
    const result = await placeOrder(restaurant, input, visitor);
    revalidatePath(`/r/${slug}`, "layout");

    // The order is committed (and its "placed" event queued by the database). No email goes out
    // for a placed order; the confirmation email is sent when staff confirm it. Draining the
    // outbox here just closes the "placed" event after the response; it never affects the result.
    after(() => dispatchDueNotifications({ restaurantId: restaurant.id }, { restaurantId: restaurant.id }));
    return result;
  });
}
