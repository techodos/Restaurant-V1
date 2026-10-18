import type { Order, Restaurant } from "@/shared/contract/models";
import {
  WHATSAPP_NOT_SENT_REASON,
  WHATSAPP_REPLACED_REASON,
  WHATSAPP_SEND_WINDOW_MINUTES,
  whatsappDigits,
  whatsappLink,
  whatsappNumberFor,
  whatsappOrderMessage,
  whatsappStage,
} from "@/shared/whatsapp-order";
import { errors } from "@/server/errors";
import { logger } from "@/server/logger";
import { cancelUnsentWhatsAppOrders, markWhatsAppOrderSent } from "@/server/repositories/orders";
import { config } from "@/server/config";
import { getLocations } from "./restaurants";

/**
 * WhatsApp checkout (phase 1, `restaurants.checkout_mode = 'whatsapp'`): which number an order goes to, and the
 * hand-off the order page shows. The message is built from the SAVED order, never from the browser.
 */

/** The branch's own WhatsApp, else the restaurant's; null when neither is a usable number. Snapshot read. */
export async function resolveWhatsAppNumber(restaurant: Restaurant, locationId: string | null | undefined): Promise<string | null> {
  const branch = locationId ? (await getLocations(restaurant.id)).find((location) => location.id === locationId) : null;
  return whatsappNumberFor(restaurant.whatsapp, branch?.whatsapp ?? null);
}

export interface WhatsAppHandoff {
  /** `https://wa.me/<number>?text=…`; null when the restaurant has no usable number (the page says so) */
  link: string | null;
  message: string;
  /** `https://wa.me/<number>` (no text): "Open chat" once the order was sent — where the tracking really happens */
  chatLink: string | null;
}

export async function getWhatsAppHandoff(restaurant: Restaurant, order: Order): Promise<WhatsAppHandoff> {
  const message = whatsappOrderMessage(order, {
    restaurantName: restaurant.name,
    currency: order.currency || restaurant.currency,
    currencySymbol: restaurant.currencySymbol,
    locale: restaurant.locale,
    orderUrl: `${config.app.siteUrl}/order/${encodeURIComponent(order.orderNumber)}`,
  });
  const number = await resolveWhatsAppNumber(restaurant, order.locationId);
  const digits = whatsappDigits(number);
  return { link: whatsappLink(number, message), message, chatLink: digits ? `https://wa.me/${digits}` : null };
}

/**
 * The customer's "Yes, I sent it" (self-reported: wa.me gives no delivery signal). Idempotent for an order already
 * confirmed; refused once the send window has passed (the order is then "not sent" and they are asked to order again).
 */
export async function confirmWhatsAppSent(restaurant: Restaurant, order: Order): Promise<void> {
  const stage = whatsappStage(order);
  if (stage === "sent") return;
  if (stage !== "awaiting") {
    throw errors.custom("CONFLICT", "This order wasn't sent in time. Please place it again.");
  }
  const updated = await markWhatsAppOrderSent(order.id, restaurant.id, WHATSAPP_SEND_WINDOW_MINUTES);
  if (!updated) throw errors.custom("CONFLICT", "This order wasn't sent in time. Please place it again.");
}

/**
 * Cancels WhatsApp orders nobody confirmed sending: past the send window, and (with `phone`) older unconfirmed ones
 * from the same customer who just ordered again. Called lazily — before the admin's order/kitchen/report reads and
 * after a new WhatsApp order — so no scheduler is needed; never throws (it is housekeeping, not the request's job).
 */
export async function expireUnsentWhatsAppOrders(
  restaurantId: string,
  options: { phone?: string | null; keepOrderId?: string | null } = {},
): Promise<void> {
  try {
    await cancelUnsentWhatsAppOrders(restaurantId, {
      windowMinutes: WHATSAPP_SEND_WINDOW_MINUTES,
      notSentReason: WHATSAPP_NOT_SENT_REASON,
      replacedReason: WHATSAPP_REPLACED_REASON,
      ...options,
    });
  } catch (error) {
    logger.error("db", "could not expire unsent WhatsApp orders", error);
  }
}
