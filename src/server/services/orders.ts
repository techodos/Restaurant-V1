import type { Order, OrderSummary } from "@/shared/contract/models";
import type { OrderStatus } from "@/shared/contract/enums";
import type { Paginated } from "@/shared/contract/api";
import type { RequestContext } from "@/server/context";
import { verifyOrderAccessToken } from "@/server/auth/tokens";
import {
  countOrdersByStatus,
  getOrderByNumber,
  getOrderForAccessGrant,
  listKitchenOrders,
  listOrders,
  listRecentOrders,
  updateOrderStatus,
  type OrderListFilters,
} from "@/server/repositories/orders";

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

/** Staff-facing order list (admin). */
export function listOrdersForStaff(
  restaurantId: string,
  filters: OrderListFilters,
  ctx: RequestContext,
): Promise<Paginated<OrderSummary>> {
  return listOrders(restaurantId, filters, ctx);
}

/** Staff-facing order detail (admin). */
export function getOrderForStaff(restaurantId: string, orderNumber: string, ctx: RequestContext): Promise<Order | null> {
  return getOrderByNumber(restaurantId, orderNumber, ctx);
}

/**
 * Advances an order's status. The transition itself is enforced by the database
 * trigger and mirrored by ORDER_STATUS_RANK; the caller (an admin action) is
 * responsible for dispatching notifications afterwards, never here.
 */
export function changeOrderStatus(
  orderId: string,
  status: OrderStatus,
  ctx: RequestContext,
  options: { note?: string | null; cancelReason?: string | null } = {},
): Promise<Order> {
  return updateOrderStatus(orderId, status, ctx, options);
}

/** Status counters for the admin dashboard and order tabs. */
export function getOrderStatusCounts(restaurantId: string, ctx: RequestContext): Promise<Record<OrderStatus, number>> {
  return countOrdersByStatus(restaurantId, ctx);
}

/** Most recent orders for the admin dashboard. */
export function getRecentOrdersForAdmin(restaurantId: string, ctx: RequestContext, limit = 8): Promise<OrderSummary[]> {
  return listRecentOrders(restaurantId, ctx, limit);
}

/** Active orders for the kitchen display (admin). */
export function getKitchenOrders(restaurantId: string, ctx: RequestContext): Promise<Order[]> {
  return listKitchenOrders(restaurantId, ctx);
}
