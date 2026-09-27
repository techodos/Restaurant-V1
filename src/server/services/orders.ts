import type { Cart, Order, OrderSummary, Restaurant } from "@/shared/contract/models";
import type { OrderStatus } from "@/shared/contract/enums";
import type { Paginated } from "@/shared/contract/api";
import type { RequestContext } from "@/server/context";
import { AppError, errors } from "@/server/errors";
import { verifyOrderAccessToken } from "@/server/auth/tokens";
import { ACTIVE_ORDER_STATUSES } from "@/shared/contract/enums";
import { canCustomerCancelOrder } from "@/shared/order-cancellation";
import {
  buildReorderLines,
  countOrdersByStatus,
  getOrderByNumber,
  getOrderForAccessGrant,
  listKitchenOrders,
  listOrders,
  listRecentOrders,
  listVisitorOrders,
  updateOrderStatus,
  type OrderListFilters,
} from "@/server/repositories/orders";
import { addToCart } from "@/server/services/cart";

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
    userId: null, // a customer is identified by customer_id only (app.current_user_id is staff / auth.users)
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

export interface MyOrders {
  /** a signed-in customer: history is available; a guest only ever gets orders in progress */
  signedIn: boolean;
  /** in progress (pending … out for delivery), newest first */
  current: Order[];
  /** completed / cancelled, newest first; always empty for a guest */
  previous: Order[];
}

/**
 * "My Orders". Ownership comes from the request (session customer or guest cart token), never
 * from anything the browser sends, and the repository query is additionally covered by RLS.
 */
export async function getMyOrders(restaurantId: string, visitor: RequestContext): Promise<MyOrders> {
  const signedIn = Boolean(visitor.customerId);
  const { orders } = await listVisitorOrders(restaurantId, visitor);
  const isActive = (order: Order) => ACTIVE_ORDER_STATUSES.includes(order.status);
  return {
    signedIn,
    current: orders.filter(isActive),
    // defence in depth: a guest never receives finished orders, whatever the query returned
    previous: signedIn ? orders.filter((order) => !isActive(order)) : [],
  };
}

export interface ReorderResult {
  addedCount: number;
  /** names of items from the past order that could not be re-added (deleted, disabled, out of window) */
  skippedItemNames: string[];
  /** the cart's real item count after the reorder, straight from addToCart — never recomputed by hand */
  itemCount: number;
}

/**
 * Re-adds a past order's lines to the visitor's current cart, repriced from the live menu (never
 * the order's old prices). `order` must already be a visitor-owned order (from findVisitorOrder/
 * trackOrder) — this function does not re-check ownership, only recomputes what is still orderable.
 * An item that was deleted, disabled, or fell outside its availability window is skipped, not fatal:
 * `resolveItemSelection` (via addToCart) throws a PricingError for exactly that, which is caught and
 * reported by name from the order snapshot instead of failing the whole reorder.
 */
export async function reorderOrder(
  restaurant: Restaurant,
  cart: Cart,
  order: Order,
  ctx: RequestContext,
): Promise<ReorderResult> {
  const lines = await buildReorderLines(order.id, ctx);
  const nameFor = (menuItemId: string, variantId: string | null) =>
    order.items?.find((item) => item.menuItemId === menuItemId && (item.variantId ?? null) === variantId)?.itemName ??
    "an item";

  let addedCount = 0;
  let itemCount = cart.itemCount;
  const skippedItemNames: string[] = [];
  for (const line of lines) {
    try {
      const result = await addToCart(restaurant, cart, {
        menuItemId: line.menuItemId,
        variantId: line.variantId,
        quantity: line.quantity,
        addons: line.addons,
      });
      itemCount = result.itemCount;
      addedCount += 1;
    } catch (error) {
      if (error instanceof AppError) {
        skippedItemNames.push(nameFor(line.menuItemId, line.variantId));
        continue;
      }
      throw error;
    }
  }
  return { addedCount, skippedItemNames, itemCount };
}

/**
 * Cancels an order at the customer's own request. Eligibility (the admin-configured
 * `ordering.customerCancellation` rule: feature on, this payment method allowed, order not yet
 * past the configured cutoff status) is the real gate, enforced here — the caller only has to
 * prove ownership first (`findVisitorOrder`) and pass a fresh copy of `order`, so a status change
 * that happened moments ago (e.g. staff just confirmed it) is caught rather than trusted from a
 * stale render. The database trigger is a second backstop: it refuses to leave a terminal status
 * regardless of this check, so a race that slips past this call still cannot cancel a completed order.
 *
 * `ctx.userId` is forced to null here, whatever the caller passes: a customer is identified to the
 * database by `customer_id` only (`app.current_user_id` / `auth.uid()` is for staff). Passing a
 * signed-in customer's id through would set that, and the DB trigger that records
 * `order_status_history.changed_by` (a FK to `auth.users`, staff-only) would then reject the write
 * with `23503` — the same bug `createOrder`/`createReservation` had before they did the same thing.
 */
export function cancelOrderByCustomer(
  order: Order,
  restaurant: Restaurant,
  ctx: RequestContext,
  reason?: string | null,
): Promise<Order> {
  if (!canCustomerCancelOrder(order, restaurant.settings)) {
    throw errors.forbidden("This order can no longer be cancelled online — please call the restaurant.");
  }
  return updateOrderStatus(order.id, "cancelled", { ...ctx, userId: null }, { cancelReason: reason?.trim() || "Cancelled by customer" });
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
