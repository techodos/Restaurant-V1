import { escapeHtml, renderEmailLayout, type EmailBrand } from "./layout";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** Sent synchronously (not through the outbox) when a customer requests a checkout email-verify code. */
export function renderVerificationCodeEmail(input: { brand: EmailBrand; code: string }): RenderedEmail {
  const codeHtml = `<div style="margin:16px 0;text-align:center;"><span style="display:inline-block;font-size:32px;font-weight:700;letter-spacing:8px;padding:12px 20px;background:#faf8f5;border-radius:8px;">${escapeHtml(
    input.code,
  )}</span></div><p style="margin:0;font-size:14px;line-height:1.6;color:#6b6259;">Enter this code to verify your email and place your order. It expires in 60 seconds.</p>`;

  return {
    subject: `${input.code} is your verification code`,
    html: renderEmailLayout({
      brand: input.brand,
      preheader: `Your verification code is ${input.code}`,
      heading: "Verify your email",
      bodyHtml: codeHtml,
      footerNote: "If you did not request this, you can ignore this email.",
    }),
    text: `Your verification code is ${input.code}. It expires in 10 minutes. Enter it to verify your email and place your order.`,
  };
}
