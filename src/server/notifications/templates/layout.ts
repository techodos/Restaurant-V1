/**
 * Shared, responsive email shell. Table layout + inline styles because mail
 * clients ignore <style> blocks and flexbox. Every value that reaches the HTML
 * goes through `escapeHtml`; colours are validated before use.
 */

export interface EmailBrand {
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  email: string | null;
  phone: string | null;
}

export interface EmailLayoutInput {
  brand: EmailBrand;
  /** hidden inbox preview line */
  preheader: string;
  heading: string;
  /** trusted, already-escaped HTML for the body */
  bodyHtml: string;
  cta?: { label: string; url: string } | null;
  footerNote?: string;
}

const DEFAULT_COLOR = "#b45309";

export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function safeColor(value: string | null | undefined): string {
  return value && /^#[0-9a-fA-F]{3,8}$/.test(value.trim()) ? value.trim() : DEFAULT_COLOR;
}

/** http(s) URLs only — anything else (javascript:, data:) is dropped. */
export function safeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function renderEmailLayout(input: EmailLayoutInput): string {
  const { brand, preheader, heading, bodyHtml, cta, footerNote } = input;
  const color = safeColor(brand.primaryColor);
  const logo = safeUrl(brand.logoUrl);
  const ctaUrl = cta ? safeUrl(cta.url) : null;

  const contact = [brand.phone ? escapeHtml(brand.phone) : "", brand.email ? escapeHtml(brand.email) : ""]
    .filter(Boolean)
    .join(" &middot; ");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f1ec;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f1b16;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f1ec;">
  <tr>
    <td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:${color};padding:20px 28px;">
            ${
              logo
                ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(brand.name)}" height="36" style="display:block;height:36px;max-width:200px;border:0;">`
                : `<span style="font-size:20px;font-weight:700;color:#ffffff;">${escapeHtml(brand.name)}</span>`
            }
          </td>
        </tr>
        <tr>
          <td style="padding:28px 28px 8px;">
            <h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:#1f1b16;">${escapeHtml(heading)}</h1>
            ${bodyHtml}
          </td>
        </tr>
        ${
          cta && ctaUrl
            ? `<tr>
          <td align="center" style="padding:8px 28px 28px;">
            <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;font-weight:600;font-size:16px;padding:14px 28px;border-radius:8px;">${escapeHtml(cta.label)}</a>
          </td>
        </tr>`
            : ""
        }
        <tr>
          <td style="padding:20px 28px;background:#faf8f5;border-top:1px solid #eee7dd;font-size:12px;line-height:1.5;color:#6b6259;">
            ${footerNote ? `<p style="margin:0 0 8px;">${escapeHtml(footerNote)}</p>` : ""}
            <p style="margin:0;"><strong>${escapeHtml(brand.name)}</strong>${contact ? ` &middot; ${contact}` : ""}</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
