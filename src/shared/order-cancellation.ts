import { ORDER_STATUS_RANK, TERMINAL_ORDER_STATUSES, type OrderStatus, type PaymentMethod } from "./contract/enums";
import type { RestaurantSettings } from "./contract/settings";

/** The parts of an order this rule needs — kept minimal so it works from a full `Order` or a summary. */
export interface CancellableOrderInfo {
  status: OrderStatus;
  paymentMethod: PaymentMethod;
}

/**
 * Single source of truth for "can this customer cancel this order themselves, right now" —
 * `restaurants.settings.ordering.customerCancellation` (admin-configurable: on/off, which payment
 * methods qualify, and the last status the order can still be in). Staff cancelling from /admin is
 * a different, unrestricted path and never calls this. Pure function: same inputs, same answer,
 * usable from a server action (the real gate) and from the order page (to decide whether to render
 * the button at all).
 */
export function canCustomerCancelOrder(order: CancellableOrderInfo, settings: RestaurantSettings): boolean {
  const rule = settings.ordering.customerCancellation;
  if (!rule.enabled) return false;
  if (TERMINAL_ORDER_STATUSES.includes(order.status)) return false;
  if (!rule.allowedPaymentMethods.includes(order.paymentMethod)) return false;
  return ORDER_STATUS_RANK[order.status] <= ORDER_STATUS_RANK[rule.cutoffStatus];
}
