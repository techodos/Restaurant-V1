import { escapeHtml, renderEmailLayout, type EmailBrand } from "./layout";
import type { RenderedEmail } from "./email-verification";

/**
 * Sent to the restaurant's own contact address when a customer asks for their account to be deleted from
 * the profile drawer. Reply-To is the customer, so the restaurant can answer straight from the mail.
 */
export function renderAccountDeletionRequestEmail(input: {
  brand: EmailBrand;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  requestedAt: Date;
}): RenderedEmail {
  const when = input.requestedAt.toUTCString();
  const rows: [string, string][] = [
    ["Name", input.customerName],
    ["Account email", input.customerEmail ?? "not set"],
    ["Mobile", input.customerPhone ?? "not set"],
    ["Requested", when],
  ];
  const table = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 16px 6px 0;color:#6b6259;font-size:14px;">${escapeHtml(label)}</td><td style="padding:6px 0;font-size:14px;font-weight:600;">${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  return {
    subject: `Account deletion request: ${input.customerName}`,
    html: renderEmailLayout({
      brand: input.brand,
      preheader: `${input.customerName} asked to delete their account`,
      heading: "Account deletion request",
      bodyHtml: `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;">A customer has asked for their account and personal data to be deleted.</p><table role="presentation" cellpadding="0" cellspacing="0">${table}</table><p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#6b6259;">Reply to this email to reach the customer.</p>`,
      footerNote: "Sent from the customer profile on your storefront.",
    }),
    text: `Account deletion request\n\n${rows.map(([label, value]) => `${label}: ${value}`).join("\n")}\n\nReply to this email to reach the customer.`,
  };
}
