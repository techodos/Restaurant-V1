import { ORDER_TYPE_LABELS, PAYMENT_METHOD_LABELS } from "./contract/enums";
import type { Order } from "./contract/models";
import { formatMoney } from "./money";

/**
 * WhatsApp checkout (phase 1): the message a customer sends to the restaurant's WhatsApp after placing an order,
 * and the `wa.me` link that opens WhatsApp with it typed in. Pure — built on the server from the SAVED order
 * (never from the browser), so every price in it is the one the order was priced at.
 */

/** `wa.me` takes the full international number as digits only ("+92 300-123 4567" → "923001234567"). */
export function whatsappDigits(number: string | null | undefined): string | null {
  const digits = (number ?? "").replace(/\D/g, "");
  // a local Pakistani mobile ("0300…") is the common way staff type it; wa.me needs the country code
  const normalised = digits.startsWith("0") && digits.length === 11 ? `92${digits.slice(1)}` : digits;
  return normalised.length >= 8 && normalised.length <= 15 ? normalised : null;
}

/**
 * What a WhatsApp-number field stores: "+<digits>" for a usable number, "" to clear it, null when it is not one
 * (shared by the admin, branch and super-admin forms so they all accept "0300 1234567" and "+92 300-123 4567").
 */
export function normalizeWhatsAppNumber(input: string | null | undefined): string | null {
  const trimmed = (input ?? "").trim();
  if (!trimmed) return "";
  const digits = whatsappDigits(trimmed);
  return digits ? `+${digits}` : null;
}

/**
 * Keep the link well inside what phones and WhatsApp accept: past this the item list is cut (with a pointer
 * to the full order page) rather than the link failing to open.
 */
export const WHATSAPP_MESSAGE_MAX = 1500;

export interface WhatsAppOrderContext {
  restaurantName: string;
  currency: string;
  currencySymbol: string;
  locale?: string;
  /** the customer's order page — shown in the message so the restaurant can open the full order */
  orderUrl: string;
}

export function whatsappOrderMessage(order: Order, context: WhatsAppOrderContext): string {
  const money = (value: string) =>
    formatMoney(value, { currency: context.currency, symbol: context.currencySymbol, locale: context.locale, compact: true });
  const head = [`New order #${order.orderNumber} — ${context.restaurantName}`, ""];

  const itemLines = (order.items ?? []).map((item) => {
    const extras = [item.variantName, ...item.addons.map((addon) => (addon.quantity > 1 ? `${addon.addonName} ×${addon.quantity}` : addon.addonName))]
      .filter(Boolean)
      .join(", ");
    const note = item.specialInstructions ? ` — "${item.specialInstructions}"` : "";
    return `${item.quantity}× ${item.itemName}${extras ? ` (${extras})` : ""} — ${money(item.lineTotal)}${note}`;
  });

  const totals: string[] = [""];
  if (Number(order.deliveryFee) > 0) totals.push(`Delivery: ${money(order.deliveryFee)}`);
  if (Number(order.discountAmount) > 0) totals.push(`Discount: −${money(order.discountAmount)}`);
  if (Number(order.taxAmount) > 0) totals.push(`Tax: ${money(order.taxAmount)}`);
  if (Number(order.serviceFee) > 0) totals.push(`Service: ${money(order.serviceFee)}`);
  if (Number(order.tipAmount) > 0) totals.push(`Tip: ${money(order.tipAmount)}`);
  totals.push(`Total: ${money(order.total)} · ${PAYMENT_METHOD_LABELS[order.paymentMethod]}`);

  const details = [
    "",
    `${ORDER_TYPE_LABELS[order.orderType]}${order.tableNumber ? ` · Table ${order.tableNumber}` : ""}`,
    `${order.customerName} · ${order.customerPhone}`,
  ];
  const address = order.deliveryAddress;
  if (order.orderType === "delivery" && address) {
    details.push([address.line1, address.line2, address.area, address.city].filter(Boolean).join(", "));
  }
  if (order.notes) details.push(`Note: ${order.notes}`);
  const tail = ["", `Order details: ${context.orderUrl}`];

  const fixed = [...head, ...totals, ...details, ...tail].join("\n");
  // cut items (never totals, address or the link) if the whole message would be too long for a link
  const budget = WHATSAPP_MESSAGE_MAX - fixed.length;
  const kept: string[] = [];
  let used = 0;
  for (const [index, line] of itemLines.entries()) {
    const remaining = itemLines.length - index - 1;
    const reserve = remaining > 0 ? 40 : 0; // room for the "+N more" line
    if (used + line.length + 1 + reserve > budget) {
      kept.push(`+${itemLines.length - index} more item(s) — see order details`);
      break;
    }
    kept.push(line);
    used += line.length + 1;
  }
  return [...head, ...kept, ...totals, ...details, ...tail].join("\n");
}

/** `https://wa.me/<digits>?text=<message>`; null when the number is not a usable international number. */
export function whatsappLink(number: string | null | undefined, text: string): string | null {
  const digits = whatsappDigits(number);
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : null;
}

/** The number an order goes to: its branch's own WhatsApp, else the restaurant's. */
export function whatsappNumberFor(restaurantWhatsapp: string | null, branchWhatsapp: string | null | undefined): string | null {
  return whatsappDigits(branchWhatsapp) ? branchWhatsapp! : whatsappDigits(restaurantWhatsapp) ? restaurantWhatsapp : null;
}

// ─── WhatsApp order lifecycle (no Business API: wa.me reports nothing back) ────────────────────────────────────
/** How long a customer has to send (and confirm) a WhatsApp order before it is treated as never sent. */
export const WHATSAPP_SEND_WINDOW_MINUTES = 30;
export const WHATSAPP_NOT_SENT_REASON = "Not sent on WhatsApp";
export const WHATSAPP_REPLACED_REASON = "Replaced by a newer WhatsApp order";

/**
 * - awaiting: saved, not yet confirmed sent, still inside the window
 * - sent: the customer confirmed "Yes, I sent it" — or staff already moved it past pending (so it clearly arrived)
 * - not_sent: never confirmed within the window (expired, or replaced by a newer order from the same phone)
 * - cancelled: cancelled for any other reason (customer / staff) after it was sent
 */
export type WhatsAppStage = "awaiting" | "sent" | "not_sent" | "cancelled";

export function whatsappSendDeadline(createdAt: string): Date {
  return new Date(new Date(createdAt).getTime() + WHATSAPP_SEND_WINDOW_MINUTES * 60_000);
}

export function whatsappStage(
  order: Pick<Order, "source" | "status" | "whatsappSentAt" | "createdAt"> & { cancelReason?: string | null },
  now: Date = new Date(),
): WhatsAppStage | null {
  if (order.source !== "whatsapp") return null;
  if (order.status === "cancelled") {
    if (order.whatsappSentAt) return "cancelled";
    // never confirmed sent: our own expiry/replacement reasons, or cancelled before anyone could know it was sent
    return order.cancelReason && order.cancelReason !== WHATSAPP_NOT_SENT_REASON && order.cancelReason !== WHATSAPP_REPLACED_REASON
      ? "cancelled"
      : "not_sent";
  }
  if (order.whatsappSentAt || order.status !== "pending") return "sent";
  return now.getTime() > whatsappSendDeadline(order.createdAt).getTime() ? "not_sent" : "awaiting";
}

