import type { Order } from "@/shared/contract/models";
import type { RequestContext } from "@/server/context";
import { getOrderByNumber } from "@/server/repositories/orders";

/**
 * Order tracking. Access is decided by the database (RLS): a guest sees an order
 * only with the cart token that placed it, a signed-in customer sees their own.
 * The visitor context therefore has to carry those credentials.
 */
export function trackOrder(restaurantId: string, orderNumber: string, visitor: RequestContext): Promise<Order | null> {
  return getOrderByNumber(restaurantId, orderNumber, {
    restaurantId,
    cartToken: visitor.cartToken ?? null,
    customerId: visitor.customerId ?? null,
    userId: visitor.userId ?? null,
  });
}
