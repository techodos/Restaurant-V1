import type { Order, OrderSummary, Restaurant, SalesAnalytics } from "@/shared/contract/models";
import type { OrderStatus } from "@/shared/contract/enums";
import type { Paginated } from "@/shared/contract/api";
import type { RequestContext } from "@/server/context";
import { AppError, errors } from "@/server/errors";
import { verifyOrderAccessToken } from "@/server/auth/tokens";
import { ACTIVE_ORDER_STATUSES } from "@/shared/contract/enums";
import { canCustomerCancelOrder } from "@/shared/order-cancellation";
import type { ReportRange } from "@/shared/reports";
import {
  buildReorderLines,
  countActiveVisitorOrders,
  countOrdersByStatus,
  getOrderByNumber,
  getOrderForAccessGrant,
  getSalesAnalytics,
  listKitchenOrders,
  listOrderActivitySince,
  listOrders,
  listRecentOrders,
  listVisitorOrders,
  updateOrderStatus,
  type OrderActivityEvent,
  type OrderListFilters,
  type OrderStatusChange,
} from "@/server/repositories/orders";

export type { OrderStatusChange };
import { viewTray, type TrayLineView } from "@/server/services/cart";

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
  /** `withDetails: false` = the order row only (no items/history/payment/delivery), e.g. live status */
  options: { withDetails?: boolean } = {},
): Promise<Order | null> {
  const grant = await verifyOrderAccessToken(accessToken);
  if (grant && grant.restaurantId === restaurantId) {
    const order = await getOrderForAccessGrant(restaurantId, orderNumber, grant.orderId, options);
    if (order) return order;
  }
  return getOrderByNumber(
    restaurantId,
    orderNumber,
    {
      restaurantId,
      cartToken: visitor.cartToken ?? null,
      customerId: visitor.customerId ?? null,
      userId: null, // a customer is identified by customer_id only (app.current_user_id is staff / auth.users)
    },
    options,
  );
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
export async function getMyOrders(
  restaurantId: string,
  visitor: RequestContext,
  /** `history: false` skips past orders (the current-orders page shows only those in progress) */
  options: { history?: boolean } = {},
): Promise<MyOrders> {
  const signedIn = Boolean(visitor.customerId);
  const { orders } = await listVisitorOrders(restaurantId, visitor, options.history === false ? { historyLimit: 0 } : {});
  const isActive = (order: Order) => ACTIVE_ORDER_STATUSES.includes(order.status);
  return {
    signedIn,
    current: orders.filter(isActive),
    // defence in depth: a guest never receives finished orders, whatever the query returned
    previous: signedIn ? orders.filter((order) => !isActive(order)) : [],
  };
}

/**
 * The number of orders this visitor has in progress — one `count(*)`, for the storefront layout's
 * widget on every page view (it used to load full active + past orders with their items to count them).
 */
export function getActiveOrderCount(restaurantId: string, visitor: RequestContext): Promise<number> {
  return countActiveVisitorOrders(restaurantId, visitor);
}

export interface ReorderResult {
  /** the past order's lines that are still orderable, priced from the current menu, for the browser's tray */
  lines: TrayLineView[];
  /** names of items from the past order that could not be re-added (deleted, disabled, out of window) */
  skippedItemNames: string[];
}

/**
 * A past order's lines, ready to go back into the visitor's tray (the browser adds them to its cookie —
 * no cart row is written). Repriced from the current menu, never the order's old prices. `order` must
 * already be a visitor-owned order (from findVisitorOrder/trackOrder) — this does not re-check ownership.
 * An item that was deleted, disabled, or fell outside its availability window is reported by the name
 * it had on the order instead of failing the whole reorder.
 */
export async function reorderLines(restaurant: Restaurant, order: Order, ctx: RequestContext): Promise<ReorderResult> {
  const lines = await buildReorderLines(order.id, ctx);
  const view = await viewTray(restaurant, { orderType: order.orderType, locationId: null, couponCode: null, lines });
  const nameFor = (menuItemId: string, variantId: string | null) =>
    order.items?.find((item) => item.menuItemId === menuItemId && (item.variantId ?? null) === variantId)?.itemName ??
    "an item";
  return {
    lines: view.lines.filter((line) => !line.problem),
    skippedItemNames: view.lines.filter((line) => line.problem).map((line) => nameFor(line.line.menuItemId, line.line.variantId)),
  };
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
): Promise<OrderStatusChange> {
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
): Promise<OrderStatusChange> {
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

/** Admin "Sales Reports" summary for one resolved date range. */
export function getSalesReport(restaurantId: string, range: ReportRange, timezone: string, ctx: RequestContext): Promise<SalesAnalytics> {
  return getSalesAnalytics(restaurantId, { fromDateKey: range.fromDateKey, toDateKey: range.toDateKey, timezone }, ctx);
}

/** Every order in the range, for the CSV export (no pagination cap below the admin UI's own page size). */
export function getOrdersForExport(restaurantId: string, range: ReportRange, ctx: RequestContext): Promise<Paginated<OrderSummary>> {
  return listOrders(restaurantId, { dateFrom: range.fromDateKey, dateTo: range.toDateKey, status: "all", page: 1, pageSize: 5000 }, ctx);
}

/** New/changed orders since a timestamp, polled by the admin's order-sound notifications (no SSE for a multi-order staff feed). */
export function getOrderActivitySince(restaurantId: string, sinceIso: string, ctx: RequestContext): Promise<OrderActivityEvent[]> {
  return listOrderActivitySince(restaurantId, sinceIso, ctx);
}
