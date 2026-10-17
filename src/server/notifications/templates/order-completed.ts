import { emailPalette, escapeHtml, paragraph, renderEmailLayout, sectionTitle, textFooter } from "./layout";
import { itemsTableHtml, itemsText } from "./order-summary";
import { firstNameOf, type OrderEmailInput, type RenderedEmail } from "./order-confirmation";

/** Sent when the order reaches "completed": thank-you, summary, and the review request (when reviews are on). */
export function renderOrderCompletedEmail({ restaurant, order, orderUrl, reviewUrl }: OrderEmailInput): RenderedEmail {
  const format = { currencySymbol: restaurant.currencySymbol, locale: restaurant.locale };
  const palette = emailPalette(restaurant.primaryColor);
  const firstName = firstNameOf(order.customerName);
  const wantsReview = Boolean(reviewUrl);

  const bodyHtml = [
    paragraph(
      `Hi ${escapeHtml(firstName)}, your order <strong style="color:#1d1a16;">${escapeHtml(order.orderNumber)}</strong> is complete. Thank you for choosing ${escapeHtml(restaurant.name)} — we hope you enjoyed every bite.`,
    ),
    wantsReview
      ? paragraph("How was it? A quick rating takes less than a minute and helps our kitchen — and the next guest — a great deal.")
      : "",
    sectionTitle("Order summary"),
    itemsTableHtml(order, format, palette),
  ].join("");

  const html = renderEmailLayout({
    brand: restaurant,
    preheader: wantsReview
      ? `Order ${order.orderNumber} is complete — tell us how it was.`
      : `Order ${order.orderNumber} is complete. Thank you for ordering.`,
    eyebrow: "Order complete",
    heading: wantsReview ? "Thank you — how was your meal?" : "Thank you for your order",
    bodyHtml,
    // the review is the main action and "view this order" a quiet link under it; without reviews, viewing is the action
    cta: wantsReview && reviewUrl ? { label: "Rate your order", url: reviewUrl } : { label: "View your order", url: orderUrl },
    secondary: wantsReview ? { label: "View this order", url: orderUrl } : null,
  });

  const text = [
    `Hi ${firstName}, your order ${order.orderNumber} from ${restaurant.name} is complete. Thank you for choosing us.`,
    "",
    itemsText(order, format),
    "",
    ...(wantsReview ? [`Rate your order: ${reviewUrl}`] : []),
    `View this order: ${orderUrl}`,
    "",
    textFooter(restaurant),
  ].join("\n");

  return {
    subject: wantsReview ? `How was your order from ${restaurant.name}?` : `Your ${restaurant.name} order ${order.orderNumber} is complete`,
    html,
    text,
  };
}
