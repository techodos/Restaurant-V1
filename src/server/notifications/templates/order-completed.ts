import { escapeHtml, renderEmailLayout } from "./layout";
import { itemsTableHtml, itemsText } from "./order-summary";
import type { OrderEmailInput, RenderedEmail } from "./order-confirmation";

/** Sent when the order reaches "completed": thank-you, summary, and the review request. */
export function renderOrderCompletedEmail({ restaurant, order, orderUrl, reviewUrl }: OrderEmailInput): RenderedEmail {
  const format = { currencySymbol: restaurant.currencySymbol, locale: restaurant.locale };
  const firstName = order.customerName.split(/\s+/)[0] ?? order.customerName;
  const wantsReview = Boolean(reviewUrl);

  const bodyHtml = `
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hi ${escapeHtml(firstName)}, your order <strong>${escapeHtml(order.orderNumber)}</strong> from ${escapeHtml(restaurant.name)} is complete. We hope you enjoyed your meal!</p>
${
  wantsReview
    ? `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">How did we do? A quick rating takes less than a minute and helps us (and other guests) a lot.</p>`
    : ""
}
<h2 style="margin:8px 0 0;font-size:16px;">Order summary</h2>
${itemsTableHtml(order, format)}
<p style="margin:16px 0 0;font-size:13px;color:#6b6259;"><a href="${escapeHtml(orderUrl)}" style="color:#6b6259;">View this order</a></p>`;

  const html = renderEmailLayout({
    brand: restaurant,
    preheader: `Order ${order.orderNumber} is complete${wantsReview ? " — tell us how it was" : ""}`,
    heading: "Order completed",
    bodyHtml,
    cta: wantsReview && reviewUrl ? { label: "Rate Your Order", url: reviewUrl } : null,
  });

  const text = [
    `Hi ${firstName}, your order ${order.orderNumber} from ${restaurant.name} is complete. We hope you enjoyed your meal!`,
    "",
    itemsText(order, format),
    "",
    ...(wantsReview ? [`Rate your order: ${reviewUrl}`] : []),
    `View this order: ${orderUrl}`,
  ].join("\n");

  return { subject: `How was your order from ${restaurant.name}?`, html, text };
}
