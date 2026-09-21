import type { Order } from "@/shared/contract/models";
import type { RequestContext } from "@/server/context";
import { verifyOrderAccessToken } from "@/server/auth/tokens";
import { getOrderByNumber, getOrderForAccessGrant } from "@/server/repositories/orders";

/**
 * Finds the order a visitor is entitled to see. Access is decided by one of two proofs:
 *  - the database (RLS): a guest sees an order only with the cart token that placed it,
 *    a signed-in customer sees their own;
 *  - a signed order-access token (the link in a notification email), which names exactly
 *    one order and works from any device.
 * Anything else returns null: an order number alone reveals nothing.
 */
export async function findVisitorOrder(
  restaurantId: string,
  orderNumber: string,
  visitor: RequestContext,
  accessToken?: string | null,
): Promise<Order | null> {
  const grant = await verifyOrderAccessToken(accessToken);
  if (grant && grant.restaurantId === restaurantId) {
    const order = await getOrderForAccessGrant(restaurantId, orderNumber, grant.orderId);
    if (order) return order;
  }
  return getOrderByNumber(restaurantId, orderNumber, {
    restaurantId,
    cartToken: visitor.cartToken ?? null,
    customerId: visitor.customerId ?? null,
    userId: visitor.userId ?? null,
  });
}

/** Order tracking. */
export function trackOrder(
  restaurantId: string,
  orderNumber: string,
  visitor: RequestContext,
  accessToken?: string | null,
): Promise<Order | null> {
  return findVisitorOrder(restaurantId, orderNumber, visitor, accessToken);
}
