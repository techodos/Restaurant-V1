import { codeBlock, emailPalette, escapeHtml, paragraph, renderEmailLayout, textFooter, type EmailBrand } from "./layout";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** What the emailed code is for: verifying the account email, or resetting a forgotten password. */
export type CodeEmailPurpose = "verify" | "reset";

const minutes = (n: number) => `${n} minute${n === 1 ? "" : "s"}`;

/**
 * Sent synchronously (not through the outbox) when a customer requests a code: email verification or password
 * reset. The code is the caller's (services/customer-auth.ts generates, hashes and stores it); this only shows it,
 * exactly as given, and never puts it in a URL. `expiresInMinutes` is the real TTL of that code.
 */
export function renderVerificationCodeEmail(input: {
  brand: EmailBrand;
  code: string;
  purpose?: CodeEmailPurpose;
  expiresInMinutes?: number;
}): RenderedEmail {
  const { brand, code } = input;
  const purpose = input.purpose ?? "verify";
  const ttl = minutes(input.expiresInMinutes ?? 10);
  const palette = emailPalette(brand.primaryColor);
  const name = escapeHtml(brand.name);

  if (purpose === "reset") {
    const bodyHtml = [
      paragraph(`We received a request to reset the password for your ${name} account. Use this code to choose a new one.`),
      codeBlock(code, palette, "Your reset code"),
      paragraph(`Enter it on the password reset screen. It expires in <strong style="color:#1d1a16;">${escapeHtml(ttl)}</strong> and can be used once.`, { size: 14 }),
    ].join("");
    return {
      subject: `${code} is your ${brand.name} password reset code`,
      html: renderEmailLayout({
        brand,
        preheader: `Your password reset code expires in ${ttl}.`,
        eyebrow: "Password reset",
        heading: "Reset your password",
        bodyHtml,
        footerNote:
          "Didn't ask for this? You can safely ignore this email — your password stays the same. Never share this code: our team will never ask you for it.",
      }),
      text: [
        `Reset your ${brand.name} password`,
        "",
        `Your reset code: ${code}`,
        `Enter it on the password reset screen. It expires in ${ttl} and can be used once.`,
        "",
        "Didn't ask for this? Ignore this email — your password stays the same. Never share this code.",
        "",
        textFooter(brand),
      ].join("\n"),
    };
  }

  const bodyHtml = [
    paragraph(`Here is the code to confirm this email address with ${name}. Enter it on the screen where you asked for it — it shows the address is yours, so your order and receipts reach you.`),
    codeBlock(code, palette, "Verification code"),
    paragraph(`The code expires in <strong style="color:#1d1a16;">${escapeHtml(ttl)}</strong>. If it runs out, ask for a new one from the same screen.`, { size: 14 }),
  ].join("");
  return {
    subject: `${code} is your ${brand.name} verification code`,
    html: renderEmailLayout({
      brand,
      preheader: `Enter this code to verify your email. It expires in ${ttl}.`,
      eyebrow: "Email verification",
      heading: "Verify your email address",
      bodyHtml,
      footerNote:
        "For your security, never share this code with anyone — not even our team. If you didn't ask for it, you can ignore this email.",
    }),
    text: [
      `Verify your email address for ${brand.name}`,
      "",
      `Verification code: ${code}`,
      `Enter it on the screen where you asked for it. It expires in ${ttl}.`,
      "",
      "Never share this code. If you didn't ask for it, ignore this email.",
      "",
      textFooter(brand),
    ].join("\n"),
  };
}
