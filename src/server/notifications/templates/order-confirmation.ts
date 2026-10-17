import { ORDER_STATUS_LABELS } from "@/shared/contract/enums";
import type { Order } from "@/shared/contract/models";
import type { NotificationOrderContext } from "../types";
import { details, emailPalette, escapeHtml, paragraph, renderEmailLayout, sectionTitle, textFooter, type EmailBrand } from "./layout";
import { estimateLine, estimateTime, fulfilmentDetail, itemsTableHtml, itemsText, orderTypeLabel } from "./order-summary";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface OrderEmailInput {
  restaurant: NotificationOrderContext["restaurant"] & Pick<EmailBrand, "siteUrl">;
  order: Order;
  /** absolute link to the order tracking page */
  orderUrl: string;
  /** absolute link to the review page for this order (completion email only) */
  reviewUrl?: string | null;
}

export const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] || name;

/** Sent once, when the restaurant confirms the order (not when the customer places it). */
export function renderOrderConfirmationEmail({ restaurant, order, orderUrl }: OrderEmailInput): RenderedEmail {
  const format = { currencySymbol: restaurant.currencySymbol, locale: restaurant.locale };
  const palette = emailPalette(restaurant.primaryColor);
  const status = ORDER_STATUS_LABELS[order.status];
  const firstName = firstNameOf(order.customerName);
  const where = fulfilmentDetail(order, restaurant.name);
  const time = estimateTime(order, restaurant.timezone);
  const estimate = estimateLine(order, restaurant.timezone);

  const facts: [string, string][] = [
    ["Order", order.orderNumber],
    ["Status", status],
    [orderTypeLabel(order), where || orderTypeLabel(order)],
    ...(time ? ([[order.orderType === "delivery" ? "Arriving" : "Ready", `About ${time}`]] as [string, string][]) : []),
  ];

  const bodyHtml = [
    paragraph(
      `Hi ${escapeHtml(firstName)}, thank you for ordering from ${escapeHtml(restaurant.name)}. Your order has been confirmed and is now with our kitchen.`,
    ),
    details(facts, palette),
    sectionTitle("Your order"),
    itemsTableHtml(order, format, palette),
  ].join("");

  const html = renderEmailLayout({
    brand: restaurant,
    preheader: `Order ${order.orderNumber} is confirmed${time ? ` — ${order.orderType === "delivery" ? "arriving" : "ready"} about ${time}` : ""}.`,
    eyebrow: "Order confirmed",
    heading: "Your order is confirmed",
    bodyHtml,
    cta: { label: "Track your order", url: orderUrl },
    footerNote: "We'll keep you posted as your order moves along. Questions about it? Reply to this email or call us and quote your order number.",
  });

  const text = [
    `Hi ${firstName}, thank you for ordering from ${restaurant.name}. Your order has been confirmed.`,
    "",
    `Order: ${order.orderNumber}`,
    `Status: ${status}`,
    `${orderTypeLabel(order)}: ${where || orderTypeLabel(order)}`,
    ...(estimate ? [estimate] : []),
    "",
    itemsText(order, format),
    "",
    `Track your order: ${orderUrl}`,
    "",
    textFooter(restaurant),
  ].join("\n");

  return { subject: `Order ${order.orderNumber} confirmed — ${restaurant.name}`, html, text };
}
