import { ORDER_STATUS_RANK, type OrderStatus, type OrderType } from "./contract/enums";

/**
 * The one forward step a staff member usually takes next, for the admin's one-click button (orders list, kitchen).
 * Delivery orders go ready -> out for delivery -> completed; pickup and dine-in go ready -> completed. Finished
 * orders have none. Any forward move stays allowed (the DB's `app.order_transition_allowed` decides); this only picks
 * the default.
 */
export function nextOrderStep(status: OrderStatus, orderType: OrderType): { status: OrderStatus; label: string } | null {
  switch (status) {
    case "pending":
      return { status: "confirmed", label: "Confirm" };
    case "confirmed":
      return { status: "preparing", label: "Start preparing" };
    case "preparing":
      return { status: "ready", label: "Mark ready" };
    case "ready":
      return orderType === "delivery" ? { status: "out_for_delivery", label: "Out for delivery" } : { status: "completed", label: "Mark completed" };
    case "out_for_delivery":
      return { status: "completed", label: "Mark delivered" };
    default:
      return null;
  }
}

/**
 * Every status staff may move an order to from here (forward only, cancellation excluded — it is its own action),
 * in progression order. "Out for delivery" only exists for delivery orders: offering it on pickup/dine-in tickets
 * was noise at best and a wrong status at worst. Terminal orders have none.
 */
export function forwardOrderStatuses(status: OrderStatus, orderType: OrderType): OrderStatus[] {
  if (status === "completed" || status === "cancelled") return [];
  return (Object.keys(ORDER_STATUS_RANK) as OrderStatus[])
    .filter((candidate) => candidate !== "cancelled" && ORDER_STATUS_RANK[candidate] > ORDER_STATUS_RANK[status])
    .filter((candidate) => candidate !== "out_for_delivery" || orderType === "delivery")
    .sort((a, b) => ORDER_STATUS_RANK[a] - ORDER_STATUS_RANK[b]);
}

