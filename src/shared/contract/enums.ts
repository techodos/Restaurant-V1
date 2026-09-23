/**
 * Enums mirrored from PostgreSQL (db/migrations/0002_enums.sql).
 * These are the single source of truth for the TypeScript side; the SQL enums
 * are authoritative for storage and a parity test keeps them aligned.
 */

export const RESTAURANT_STATUSES = ["onboarding", "active", "suspended", "closed"] as const;
export type RestaurantStatus = (typeof RESTAURANT_STATUSES)[number];

export const TEAM_ROLES = ["owner", "admin", "manager", "staff"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];

export const WEBSITE_STATUSES = ["draft", "published", "disabled"] as const;
export type WebsiteStatus = (typeof WEBSITE_STATUSES)[number];

export const MEDIA_PURPOSES = [
  "logo", "cover", "hero", "gallery", "menu_item", "category",
  "location", "website", "avatar", "other",
] as const;
export type MediaPurpose = (typeof MEDIA_PURPOSES)[number];

export const ORDER_TYPES = ["delivery", "pickup", "dine_in"] as const;
export type OrderType = (typeof ORDER_TYPES)[number];

export const ORDER_STATUSES = [
  "pending", "confirmed", "preparing", "ready", "out_for_delivery", "completed", "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Terminal statuses can never be left. */
export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = ["completed", "cancelled"];

/** Orders still in progress ("current" in My Orders): every non-terminal status. */
export const ACTIVE_ORDER_STATUSES: readonly OrderStatus[] = ORDER_STATUSES.filter(
  (status) => !TERMINAL_ORDER_STATUSES.includes(status),
);

/**
 * Status progression ranks. Forward jumps are allowed (a small kitchen may go
 * pending → preparing directly); backwards moves and moves out of a terminal
 * state are rejected by both the UI and the `app.order_transition_allowed`
 * PostgreSQL trigger. Mirrored in SQL so the rule holds for every client.
 */
export const ORDER_STATUS_RANK: Record<OrderStatus, number> = {
  pending: 0,
  confirmed: 1,
  preparing: 2,
  ready: 3,
  out_for_delivery: 4,
  completed: 5,
  cancelled: -1,
};

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  out_for_delivery: "Out for delivery",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  delivery: "Delivery",
  pickup: "Pickup",
  dine_in: "Dine-in",
};

export const PAYMENT_METHODS = [
  "cash_on_delivery", "cash", "card_online", "card_terminal", "wallet", "bank_transfer",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const ONLINE_PAYMENT_METHODS: readonly PaymentMethod[] = ["card_online", "wallet", "bank_transfer"];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash_on_delivery: "Cash on delivery",
  cash: "Cash at restaurant",
  card_online: "Card (online)",
  card_terminal: "Card at terminal",
  wallet: "Wallet",
  bank_transfer: "Bank transfer",
};

export const PAYMENT_STATUSES = [
  "pending", "authorized", "paid", "failed", "refunded", "cancelled",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const DELIVERY_STATUSES = [
  "unassigned", "assigned", "picked_up", "in_transit", "delivered", "failed", "cancelled",
] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  unassigned: "Awaiting driver",
  assigned: "Driver assigned",
  picked_up: "Picked up",
  in_transit: "On the way",
  delivered: "Delivered",
  failed: "Delivery failed",
  cancelled: "Cancelled",
};

export const RESERVATION_STATUSES = [
  "pending", "confirmed", "seated", "completed", "cancelled", "no_show",
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const RESERVATION_STATUS_LABELS: Record<ReservationStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  seated: "Seated",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No show",
};

export const REVIEW_STATUSES = ["pending", "approved", "rejected"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

export const COUPON_DISCOUNT_TYPES = ["percentage", "fixed"] as const;
export type CouponDiscountType = (typeof COUPON_DISCOUNT_TYPES)[number];

export const CART_STATUSES = ["active", "converted", "abandoned"] as const;
export type CartStatus = (typeof CART_STATUSES)[number];

export const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}

export function isOrderType(value: unknown): value is OrderType {
  return typeof value === "string" && (ORDER_TYPES as readonly string[]).includes(value);
}

export function isTeamRole(value: unknown): value is TeamRole {
  return typeof value === "string" && (TEAM_ROLES as readonly string[]).includes(value);
}
