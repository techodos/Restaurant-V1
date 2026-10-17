import { ORDER_TYPE_LABELS } from "@/shared/contract/enums";
import type { Order } from "@/shared/contract/models";
import { formatMoney } from "@/shared/money";
import { escapeHtml, type EmailPalette } from "./layout";

/**
 * Pieces shared by every order email: fulfilment, estimate, the receipt and its plain-text twin. Amounts are the
 * order's own stored values (subtotal, fees, tax, total); nothing is recalculated here.
 */

export interface SummaryFormat {
  currencySymbol: string;
  locale: string;
}

const INK = "#1d1a16";
const MUTED = "#7a7268";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

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

/** Where the order goes, without the order-type prefix (for a labelled row). */
export function fulfilmentDetail(order: Order, restaurantName: string): string {
  if (order.orderType === "delivery") {
    const a = order.deliveryAddress;
    return a ? [a.line1, a.line2, a.area, a.city].filter(Boolean).join(", ") : "";
  }
  return `${order.locationName ?? restaurantName}${order.orderType === "dine_in" && order.tableNumber ? `, table ${order.tableNumber}` : ""}`;
}

/** "about 19:40", in the restaurant's time zone; null once the order is finished or there is no estimate. */
export function estimateTime(order: Order, timeZone?: string): string | null {
  if (!order.estimatedReadyAt) return null;
  if (order.status === "completed" || order.status === "cancelled") return null;
  const date = new Date(order.estimatedReadyAt);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone });
  } catch {
    return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
}

export function estimateLine(order: Order, timeZone?: string): string | null {
  const time = estimateTime(order, timeZone);
  return time ? `Estimated ${order.orderType === "delivery" ? "arrival" : "ready"} time: about ${time}` : null;
}

/** Receipt: one row per line (quantity, name + options, price), then the charges that apply, then the total. */
export function itemsTableHtml(order: Order, format: SummaryFormat, palette: EmailPalette): string {
  const rows = (order.items ?? [])
    .map((item) => {
      const extras = [
        item.variantName,
        ...item.addons.map((addon) => `+ ${addon.addonName}${addon.quantity > 1 ? ` ×${addon.quantity}` : ""}`),
      ].filter(Boolean);
      const cell = `padding:14px 0;border-bottom:1px solid ${palette.rule};vertical-align:top;font-family:${SANS};`;
      return `<tr>
  <td width="36" style="${cell}font-size:14px;line-height:1.5;color:${MUTED};white-space:nowrap;">${item.quantity}&times;</td>
  <td style="${cell}font-size:15px;line-height:1.5;color:${INK};word-break:break-word;">${escapeHtml(item.itemName)}${
    extras.length ? `<br><span style="font-size:13px;color:${MUTED};">${escapeHtml(extras.join(" · "))}</span>` : ""
  }</td>
  <td align="right" style="${cell}padding-left:12px;font-size:15px;line-height:1.5;color:${INK};white-space:nowrap;">${escapeHtml(money(item.lineTotal, format))}</td>
</tr>`;
    })
    .join("");

  const charge = (label: string, value: string) => `<tr>
  <td style="padding:4px 0;font-family:${SANS};font-size:14px;line-height:1.5;color:${MUTED};">${escapeHtml(label)}</td>
  <td align="right" style="padding:4px 0;font-family:${SANS};font-size:14px;line-height:1.5;color:${INK};white-space:nowrap;">${escapeHtml(value)}</td>
</tr>`;

  const charges: string[] = [charge("Subtotal", money(order.subtotal, format))];
  if (Number(order.discountAmount) > 0) charges.push(charge("Discount", `− ${money(order.discountAmount, format)}`));
  if (Number(order.deliveryFee) > 0) charges.push(charge("Delivery", money(order.deliveryFee, format)));
  if (Number(order.serviceFee) > 0) charges.push(charge("Service fee", money(order.serviceFee, format)));
  if (Number(order.taxAmount) > 0) charges.push(charge("Tax", money(order.taxAmount, format)));
  if (Number(order.tipAmount) > 0) charges.push(charge("Tip", money(order.tipAmount, format)));

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0;border-top:1px solid ${palette.rule};">
${rows}
</table>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:14px 0 0;">
${charges.join("\n")}
<tr><td colspan="2" style="padding:12px 0 0;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="height:2px;line-height:2px;font-size:2px;background:${palette.brand};">&nbsp;</td></tr></table></td></tr>
<tr>
  <td style="padding:12px 0 0;font-family:${SANS};font-size:16px;font-weight:700;color:${INK};">Total</td>
  <td align="right" style="padding:12px 0 0;font-family:${SANS};font-size:20px;font-weight:700;color:${INK};white-space:nowrap;">${escapeHtml(money(order.total, format))}</td>
</tr>
</table>`;
}

export function itemsText(order: Order, format: SummaryFormat): string {
  const lines = (order.items ?? []).map(
    (item) =>
      `${item.quantity} x ${item.itemName}${item.variantName ? ` (${item.variantName})` : ""}${
        item.addons.length ? ` + ${item.addons.map((a) => a.addonName).join(", ")}` : ""
      } — ${money(item.lineTotal, format)}`,
  );
  lines.push("", `Subtotal: ${money(order.subtotal, format)}`);
  if (Number(order.discountAmount) > 0) lines.push(`Discount: − ${money(order.discountAmount, format)}`);
  if (Number(order.deliveryFee) > 0) lines.push(`Delivery: ${money(order.deliveryFee, format)}`);
  if (Number(order.serviceFee) > 0) lines.push(`Service fee: ${money(order.serviceFee, format)}`);
  if (Number(order.taxAmount) > 0) lines.push(`Tax: ${money(order.taxAmount, format)}`);
  if (Number(order.tipAmount) > 0) lines.push(`Tip: ${money(order.tipAmount, format)}`);
  lines.push(`Total: ${money(order.total, format)}`);
  return lines.join("\n");
}

export function orderTypeLabel(order: Order): string {
  return ORDER_TYPE_LABELS[order.orderType];
}
