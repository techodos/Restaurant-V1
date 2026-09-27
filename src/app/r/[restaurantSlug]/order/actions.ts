"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { ApiResult } from "@/shared/contract/api";
import type { OrderStatus } from "@/shared/contract/enums";
import { action, errors } from "@/server/errors";
import { dispatchDueNotifications, registerPushToken } from "@/server/services/notifications";
import { cancelOrderByCustomer, findVisitorOrder, reorderOrder, type ReorderResult } from "@/server/services/orders";
import { requireRestaurant } from "@/server/services/restaurants";
import { registerPushTokenSchema } from "@/server/validation/notifications";
import { cancelOrderSchema } from "@/server/validation/orders";
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

/**
 * Customer self-cancellation. Ownership is proven the same way every other order action proves it
 * (findVisitorOrder); eligibility (feature on, payment method allowed, not past the cutoff status)
 * is enforced by `cancelOrderByCustomer`, not here — this action does not re-check anything the
 * service already checks. Dispatches notifications immediately after, same as every other action
 * that changes an order's status (cancelled sends a push, no email — see rules.ts).
 */
export async function cancelOrderAction(
  slug: string,
  orderNumber: string,
  accessToken?: string,
  payload: unknown = {},
): Promise<ApiResult<{ status: OrderStatus }>> {
  return action(async () => {
    const input = cancelOrderSchema.parse(payload);
    const restaurant = await requireRestaurant(slug);
    const visitor = await getVisitorContext(restaurant.id);
    const order = await findVisitorOrder(restaurant.id, orderNumber, visitor, accessToken);
    if (!order) throw errors.notFound("Order");

    const ctx = { ...visitor, restaurantId: restaurant.id };
    const updated = await cancelOrderByCustomer(order, restaurant, ctx, input.reason || null);

    revalidatePath(`/r/${slug}/order/${encodeURIComponent(orderNumber)}`);
    revalidatePath(`/r/${slug}/current-orders`);
    revalidatePath(`/r/${slug}/orders`);
    after(() => dispatchDueNotifications({ restaurantId: restaurant.id }, { restaurantId: restaurant.id }));
    return { status: updated.status };
  });
}
