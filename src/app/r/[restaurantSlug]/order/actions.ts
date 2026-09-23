"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import type { ApiResult } from "@/shared/contract/api";
import { action, errors } from "@/server/errors";
import { registerPushToken } from "@/server/services/notifications";
import { findVisitorOrder, reorderOrder, type ReorderResult } from "@/server/services/orders";
import { requireRestaurant } from "@/server/services/restaurants";
import { registerPushTokenSchema } from "@/server/validation/notifications";
import { getVisitorContext, setCartCountHint } from "@/web/session";
import { openStorefrontCart } from "@/web/storefront";

/** Links this browser's push token to the customer who placed the order (ownership is proven by the service). */
export async function registerPushTokenAction(slug: string, payload: unknown): Promise<ApiResult<{ registered: true }>> {
  return action(async () => {
    const input = registerPushTokenSchema.parse(payload);
    const restaurant = await requireRestaurant(slug);
    const visitor = await getVisitorContext(restaurant.id);
    const userAgent = (await headers()).get("user-agent");
    await registerPushToken(restaurant, input, visitor, userAgent);
    return { registered: true as const };
  });
}

/**
 * Re-orders a past order into the visitor's current cart. Ownership is proven the same way the
 * order page proves it (findVisitorOrder: cart cookie, signed-in customer, or a signed order-access
 * token) — the order number alone proves nothing. Items no longer orderable are skipped, not fatal;
 * the caller shows `skippedItemNames` and sends the visitor to /cart to review before checkout.
 */
export async function reorderAction(
  slug: string,
  orderNumber: string,
  accessToken?: string,
): Promise<ApiResult<ReorderResult>> {
  return action(async () => {
    const { restaurant, cart } = await openStorefrontCart(slug);
    const visitor = await getVisitorContext(restaurant.id);
    const order = await findVisitorOrder(restaurant.id, orderNumber, visitor, accessToken);
    if (!order) throw errors.notFound("Order");
    const result = await reorderOrder(restaurant, cart, order, { ...visitor, restaurantId: restaurant.id });
    await setCartCountHint(result.itemCount);
    revalidatePath(`/r/${slug}`, "layout");
    return result;
  });
}
