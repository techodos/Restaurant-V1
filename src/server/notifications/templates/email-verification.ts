import { escapeHtml, renderEmailLayout, type EmailBrand } from "./layout";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** What the emailed code is for: verifying the account email, or resetting a forgotten password. */
export type CodeEmailPurpose = "verify" | "reset";

const COPY: Record<CodeEmailPurpose, { heading: string; subject: string; use: string }> = {
  verify: { heading: "Verify your email", subject: "is your verification code", use: "verify your email and place your order" },
  reset: { heading: "Reset your password", subject: "is your password reset code", use: "reset your password" },
};

/** Sent synchronously (not through the outbox) when a customer requests a code: email verification or password reset. */
export function renderVerificationCodeEmail(input: { brand: EmailBrand; code: string; purpose?: CodeEmailPurpose }): RenderedEmail {
  const copy = COPY[input.purpose ?? "verify"];
  const codeHtml = `<div style="margin:16px 0;text-align:center;"><span style="display:inline-block;font-family:'SF Mono',Consolas,Menlo,monospace;font-size:34px;font-weight:700;letter-spacing:10px;padding:14px 22px;background:#faf8f5;border:1px solid #eee7dd;border-radius:8px;user-select:all;">${escapeHtml(
    input.code,
  )}</span></div><p style="margin:0;font-size:14px;line-height:1.6;color:#6b6259;">Enter this code to ${copy.use}. It expires in 10 minutes.</p>`;

  return {
    subject: `${input.code} ${copy.subject}`,
    html: renderEmailLayout({
      brand: input.brand,
      preheader: `Your code is ${input.code}`,
      heading: copy.heading,
      bodyHtml: codeHtml,
      footerNote:
        input.purpose === "reset"
          ? "If you did not ask to reset your password, you can ignore this email. Your password stays the same."
          : "If you did not request this, you can ignore this email.",
    }),
    text: `Your code is ${input.code}. It expires in 10 minutes. Enter it to ${copy.use}.`,
  };
}
