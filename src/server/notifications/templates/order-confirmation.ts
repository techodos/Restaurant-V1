import { ORDER_STATUS_LABELS } from "@/shared/contract/enums";
import type { Order } from "@/shared/contract/models";
import type { NotificationOrderContext } from "../types";
import { escapeHtml, renderEmailLayout } from "./layout";
import { estimateLine, fulfilmentLines, itemsTableHtml, itemsText, orderTypeLabel } from "./order-summary";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export interface OrderEmailInput {
  restaurant: NotificationOrderContext["restaurant"];
  order: Order;
  /** absolute link to the order tracking page */
  orderUrl: string;
  /** absolute link to the review page for this order (completion email only) */
  reviewUrl?: string | null;
}

/** Sent once, when the restaurant confirms the order (not when the customer places it). */
export function renderOrderConfirmationEmail({ restaurant, order, orderUrl }: OrderEmailInput): RenderedEmail {
  const format = { currencySymbol: restaurant.currencySymbol, locale: restaurant.locale };
  const fulfilment = fulfilmentLines(order, restaurant.name);
  const estimate = estimateLine(order, restaurant.timezone);
  const status = ORDER_STATUS_LABELS[order.status];
  const firstName = order.customerName.split(/\s+/)[0] ?? order.customerName;

  const facts = [
    `<strong>Order number:</strong> ${escapeHtml(order.orderNumber)}`,
    `<strong>Status:</strong> ${escapeHtml(status)}`,
    `<strong>Type:</strong> ${escapeHtml(orderTypeLabel(order))} &middot; ${escapeHtml(fulfilment.join(" "))}`,
    ...(estimate ? [escapeHtml(estimate)] : []),
  ]
    .map((line) => `<p style="margin:0 0 6px;font-size:14px;line-height:1.5;">${line}</p>`)
    .join("");

  const bodyHtml = `
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hi ${escapeHtml(firstName)}, thanks for ordering from ${escapeHtml(restaurant.name)}. Good news: your order has been confirmed and is on its way to the kitchen.</p>
<div style="background:#faf8f5;border-radius:8px;padding:14px 16px;margin:0 0 16px;">${facts}</div>
<h2 style="margin:8px 0 0;font-size:16px;">Your order</h2>
${itemsTableHtml(order, format)}`;

  const html = renderEmailLayout({
    brand: restaurant,
    preheader: `Order ${order.orderNumber} confirmed by ${restaurant.name}`,
    heading: "Your order is confirmed",
    bodyHtml,
    cta: { label: "Track your order", url: orderUrl },
    footerNote: "You will get updates about this order as it moves along.",
  });

  const text = [
    `Hi ${firstName}, thanks for ordering from ${restaurant.name}.`,
    "",
    `Order number: ${order.orderNumber}`,
    `Status: ${status}`,
    `${orderTypeLabel(order)}: ${fulfilment.join(" ")}`,
    ...(estimate ? [estimate] : []),
    "",
    itemsText(order, format),
    "",
    `Track your order: ${orderUrl}`,
  ].join("\n");

  return { subject: `Order ${order.orderNumber} confirmed — ${restaurant.name}`, html, text };
}
