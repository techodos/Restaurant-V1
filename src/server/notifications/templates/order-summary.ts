import { ORDER_TYPE_LABELS } from "@/shared/contract/enums";
import type { Order } from "@/shared/contract/models";
import { formatMoney } from "@/shared/money";
import { escapeHtml } from "./layout";

/** Rows shared by every order email: items, totals, fulfilment. Plain-text twin included. */

export interface SummaryFormat {
  currencySymbol: string;
  locale: string;
}

const money = (value: string, format: SummaryFormat) =>
  formatMoney(value, { currency: format.currencySymbol, locale: format.locale });

export function fulfilmentLines(order: Order, restaurantName: string): string[] {
  if (order.orderType === "delivery") {
    const address = order.deliveryAddress
      ? [order.deliveryAddress.line1, order.deliveryAddress.line2, order.deliveryAddress.area, order.deliveryAddress.city]
          .filter(Boolean)
          .join(", ")
      : "";
    return [`Delivery${address ? ` to ${address}` : ""}`];
  }
  if (order.orderType === "pickup") {
    return [`Pickup from ${order.locationName ?? restaurantName}`];
  }
  return [`Dine-in at ${order.locationName ?? restaurantName}${order.tableNumber ? `, table ${order.tableNumber}` : ""}`];
}

export function estimateLine(order: Order, timeZone?: string): string | null {
  if (!order.estimatedReadyAt) return null;
  if (order.status === "completed" || order.status === "cancelled") return null;
  const date = new Date(order.estimatedReadyAt);
  if (Number.isNaN(date.getTime())) return null;
  let time: string;
  try {
    time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone });
  } catch {
    time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
  return `Estimated ${order.orderType === "delivery" ? "arrival" : "ready"} time: about ${time}`;
}

export function itemsTableHtml(order: Order, format: SummaryFormat): string {
  const rows = (order.items ?? [])
    .map((item) => {
      const extras = [
        item.variantName,
        ...item.addons.map((addon) => `+ ${addon.addonName}${addon.quantity > 1 ? ` ×${addon.quantity}` : ""}`),
      ].filter(Boolean);
      return `<tr>
  <td style="padding:10px 0;border-bottom:1px solid #f0ebe3;font-size:14px;vertical-align:top;">
    <strong>${item.quantity} &times; ${escapeHtml(item.itemName)}</strong>
    ${extras.length ? `<br><span style="color:#6b6259;font-size:12px;">${escapeHtml(extras.join(" · "))}</span>` : ""}
  </td>
  <td align="right" style="padding:10px 0 10px 12px;border-bottom:1px solid #f0ebe3;font-size:14px;white-space:nowrap;vertical-align:top;">${escapeHtml(money(item.lineTotal, format))}</td>
</tr>`;
    })
    .join("");

  const totalRow = (label: string, value: string, strong = false) =>
    `<tr>
  <td style="padding:4px 0;font-size:${strong ? 16 : 13}px;${strong ? "font-weight:700;" : "color:#6b6259;"}">${escapeHtml(label)}</td>
  <td align="right" style="padding:4px 0;font-size:${strong ? 16 : 13}px;${strong ? "font-weight:700;" : ""}">${escapeHtml(value)}</td>
</tr>`;

  const extras: string[] = [totalRow("Subtotal", money(order.subtotal, format))];
  if (Number(order.discountAmount) > 0) extras.push(totalRow("Discount", `− ${money(order.discountAmount, format)}`));
  if (Number(order.deliveryFee) > 0) extras.push(totalRow("Delivery", money(order.deliveryFee, format)));
  if (Number(order.serviceFee) > 0) extras.push(totalRow("Service fee", money(order.serviceFee, format)));
  if (Number(order.taxAmount) > 0) extras.push(totalRow("Tax", money(order.taxAmount, format)));
  if (Number(order.tipAmount) > 0) extras.push(totalRow("Tip", money(order.tipAmount, format)));

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:8px 0 0;">
${rows}
</table>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:12px 0 0;">
${extras.join("\n")}
<tr><td colspan="2" style="border-top:2px solid #1f1b16;padding-top:8px;"></td></tr>
${totalRow("Total", money(order.total, format), true)}
</table>`;
}

export function itemsText(order: Order, format: SummaryFormat): string {
  const lines = (order.items ?? []).map(
    (item) => `${item.quantity} x ${item.itemName}${item.variantName ? ` (${item.variantName})` : ""} - ${money(item.lineTotal, format)}`,
  );
  lines.push("", `Total: ${money(order.total, format)}`);
  return lines.join("\n");
}

export function orderTypeLabel(order: Order): string {
  return ORDER_TYPE_LABELS[order.orderType];
}
