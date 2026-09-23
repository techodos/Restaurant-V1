import type { OrderStatus, OrderType } from "@/shared/contract/enums";

/**
 * The notification strategy in one place.
 *
 *   event              email   push
 *   placed             no      no      (the customer only sees "order received" on screen)
 *   confirmed          yes     no      order confirmation email, sent when staff confirm the order
 *   preparing          no      yes
 *   ready              no      yes
 *   out_for_delivery   no      yes
 *   completed          yes     yes     completion email carries the review request
 *   cancelled          no      yes
 *
 * Change a cell to change behaviour; nothing else needs to know.
 */

export type NotificationEventType = "placed" | OrderStatus;

export interface ChannelRule {
  email: boolean;
  push: boolean;
}

const NONE: ChannelRule = { email: false, push: false };

export const CHANNEL_RULES: Record<NotificationEventType, ChannelRule> = {
  placed: NONE,
  pending: NONE,
  confirmed: { email: true, push: false },
  preparing: { email: false, push: true },
  ready: { email: false, push: true },
  out_for_delivery: { email: false, push: true },
  completed: { email: true, push: true },
  cancelled: { email: false, push: true },
};

/**
 * Reservation events share the outbox but not the order rules above: they are email only.
 *   requested   yes   submitted, awaiting the restaurant ("not confirmed yet")
 *   confirmed   yes   the restaurant confirmed the reservation
 * Cancelled / seated / no-show reservations send nothing (unchanged behaviour).
 */
export const RESERVATION_EMAIL_EVENTS: readonly string[] = ["requested", "confirmed"];

export function channelsFor(eventType: string): ChannelRule {
  return CHANNEL_RULES[eventType as NotificationEventType] ?? NONE;
}

export interface PushCopyInput {
  orderNumber: string;
  restaurantName: string;
  orderType: OrderType;
}

export interface PushCopy {
  title: string;
  body: string;
}

/** Title/body for a status push, or null when that status is not pushed. */
export function pushCopyFor(eventType: string, input: PushCopyInput): PushCopy | null {
  const { orderNumber, restaurantName, orderType } = input;
  switch (eventType) {
    case "preparing":
      return {
        title: "Your order is being prepared",
        body: `Order ${orderNumber} is now being prepared by ${restaurantName}.`,
      };
    case "ready":
      return {
        title: "Your order is ready",
        body:
          orderType === "pickup"
            ? `Order ${orderNumber} is ready for pickup.`
            : orderType === "dine_in"
              ? `Order ${orderNumber} is ready and will be right with you.`
              : `Order ${orderNumber} is ready and waiting for the rider.`,
      };
    case "out_for_delivery":
      return { title: "Your order is on the way", body: `Order ${orderNumber} is out for delivery.` };
    case "completed":
      return {
        title: "Order completed",
        body: `Your order ${orderNumber} has been completed. We hope you enjoyed your meal!`,
      };
    case "cancelled":
      return { title: "Order cancelled", body: `Your order ${orderNumber} has been cancelled.` };
    default:
      return null;
  }
}
