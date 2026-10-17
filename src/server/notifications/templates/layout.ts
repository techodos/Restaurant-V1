/**
 * The one email design system: a shared shell (header, card, footer) plus small building blocks every template
 * composes (paragraph, panel, details, code, receipt rows, button). Table layout + inline styles, because mail
 * clients ignore <style> blocks, flexbox and most of CSS; system/serif font stacks only (no web fonts).
 *
 * Branding is per restaurant and never hardcoded: every colour derives from `brand.primaryColor` (tints for panels
 * and rules, a darkened shade for text accents, black or white button text chosen by contrast), so a light, dark,
 * warm or cool brand all stay readable. Every value that reaches the HTML goes through `escapeHtml`; colours and
 * URLs are validated before use.
 */

export interface EmailBrand {
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  email: string | null;
  phone: string | null;
  /** the storefront origin (NEXT_PUBLIC_SITE_URL): footer link, and the base for a relative logo path */
  siteUrl?: string | null;
}

export interface EmailLayoutInput {
  brand: EmailBrand;
  /** hidden inbox preview line */
  preheader: string;
  /** small uppercase label above the heading ("Order confirmed", "Verification code") */
  eyebrow?: string;
  heading: string;
  /** trusted, already-escaped HTML for the body (compose it from the blocks below) */
  bodyHtml: string;
  cta?: { label: string; url: string } | null;
  /** a quiet text link under the button (the secondary action) */
  secondary?: { label: string; url: string } | null;
  /** quiet line under the button (security note, "you will get updates…") */
  footerNote?: string;
}

const DEFAULT_COLOR = "#7a5c3e";
const INK = "#1d1a16";
const BODY = "#4a443d";
const MUTED = "#7a7268";
const SERIF = "Georgia,'Times New Roman',Times,serif";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
const MONO = "'SF Mono',SFMono-Regular,Consolas,'Liberation Mono',Menlo,monospace";

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

// ─── colour ─────────────────────────────────────────────────────────────────────────────────────────────────────

type Rgb = [number, number, number];

function rgb(hex: string): Rgb {
  let h = hex.replace("#", "");
  if (h.length === 3 || h.length === 4) h = h.slice(0, 3).split("").map((c) => c + c).join("");
  h = h.slice(0, 6);
  return [0, 2, 4].map((i) => Number.parseInt(h.slice(i, i + 2), 16)) as Rgb;
}

const hex = (c: Rgb) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => a[i]! + (b[i]! - a[i]!) * t) as Rgb;

function luminance(c: Rgb): number {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(rgb(a)), luminance(rgb(b))].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}

/**
 * The palette for one brand colour. `accent` is the brand colour, darkened until it reads as text on white (4.5:1);
 * `onBrand` is white or near-black, whichever contrasts more with the brand fill; tints are the brand mixed into a
 * warm white so panels and rules carry the brand quietly.
 */
export function emailPalette(primary: string | null | undefined) {
  const brand = safeColor(primary);
  const base = rgb(brand);
  let accent = base;
  for (let i = 0; i < 12 && contrast(hex(accent), "#ffffff") < 4.5; i++) accent = mix(accent, [0, 0, 0], 0.12);
  const warmWhite: Rgb = [252, 250, 246];
  return {
    brand: hex(base),
    onBrand: contrast(hex(base), "#ffffff") >= contrast(hex(base), INK) ? "#ffffff" : INK,
    accent: hex(accent),
    canvas: hex(mix(warmWhite, base, 0.05)),
    panel: hex(mix(warmWhite, base, 0.035)),
    rule: hex(mix([234, 229, 220], base, 0.12)),
    darkHeader: contrast(hex(base), "#ffffff") >= 4.5,
  };
}

export type EmailPalette = ReturnType<typeof emailPalette>;

/** A logo mail clients will actually show: absolute http(s), not SVG (Gmail and Outlook drop SVG). */
export function emailLogoUrl(brand: EmailBrand): string | null {
  if (!brand.logoUrl) return null;
  const absolute = brand.logoUrl.startsWith("/") && !brand.logoUrl.startsWith("//") && brand.siteUrl ? `${brand.siteUrl.replace(/\/$/, "")}${brand.logoUrl}` : brand.logoUrl;
  const url = safeUrl(absolute);
  if (!url || /\.svg(\?|#|$)/i.test(new URL(url).pathname)) return null;
  return url;
}

// ─── building blocks (return trusted HTML; every dynamic value is escaped inside) ─────────────────────────────

export function paragraph(html: string, options: { muted?: boolean; size?: number; margin?: string } = {}): string {
  return `<p style="margin:${options.margin ?? "0 0 16px"};font-family:${SANS};font-size:${options.size ?? 15}px;line-height:1.65;color:${options.muted ? MUTED : BODY};">${html}</p>`;
}

export function sectionTitle(text: string): string {
  return `<p style="margin:28px 0 10px;font-family:${SANS};font-size:11px;line-height:1.4;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${MUTED};">${escapeHtml(text)}</p>`;
}

export function panel(innerHtml: string, palette: EmailPalette, padding = "18px 20px"): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;margin:0 0 20px;">
<tr><td style="padding:${padding};background:${palette.panel};border:1px solid ${palette.rule};border-radius:12px;">${innerHtml}</td></tr>
</table>`;
}

/** Label / value pairs (order facts, reservation details). Long values wrap instead of widening the email. */
export function details(rows: [string, string][], palette: EmailPalette): string {
  const body = rows
    .map(
      ([label, value], index) => `<tr>
<td valign="top" style="padding:${index ? "10px" : "0"} 16px 0 0;width:38%;font-family:${SANS};font-size:12px;line-height:1.5;letter-spacing:0.4px;text-transform:uppercase;color:${MUTED};">${escapeHtml(label)}</td>
<td valign="top" style="padding:${index ? "10px" : "0"} 0 0;font-family:${SANS};font-size:15px;line-height:1.5;font-weight:600;color:${INK};word-break:break-word;">${escapeHtml(value)}</td>
</tr>`,
    )
    .join("");
  return panel(`<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${body}</table>`, palette);
}

/**
 * A one-time code, large and spaced for reading, as ONE text node so a copy gives exactly the code (the spacing is
 * letter-spacing, not inserted characters).
 */
export function codeBlock(code: string, palette: EmailPalette, caption: string): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;margin:4px 0 20px;">
<tr><td align="center" style="padding:22px 16px 20px;background:${palette.panel};border:1px solid ${palette.rule};border-radius:14px;">
<p style="margin:0 0 10px;font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:${MUTED};">${escapeHtml(caption)}</p>
<p style="margin:0;font-family:${MONO};font-size:36px;line-height:1.2;font-weight:700;letter-spacing:10px;color:${INK};padding-left:10px;-webkit-user-select:all;user-select:all;">${escapeHtml(code)}</p>
</td></tr>
</table>`;
}

export function divider(palette: EmailPalette, margin = "8px 0 20px"): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:${margin};"><tr><td style="height:1px;line-height:1px;font-size:1px;background:${palette.rule};">&nbsp;</td></tr></table>`;
}

/** A bulletproof button (a table cell, so Outlook keeps the fill). */
export function button(label: string, url: string, palette: EmailPalette): string {
  const href = safeUrl(url);
  if (!href) return "";
  return `<table role="presentation" cellspacing="0" cellpadding="0" align="center" style="margin:8px auto 4px;border-collapse:separate;">
<tr><td align="center" bgcolor="${palette.brand}" style="border-radius:10px;background:${palette.brand};">
<a href="${escapeHtml(href)}" style="display:inline-block;padding:15px 34px;font-family:${SANS};font-size:15px;line-height:1.2;font-weight:700;letter-spacing:0.3px;color:${palette.onBrand};text-decoration:none;border-radius:10px;">${escapeHtml(label)}</a>
</td></tr>
</table>`;
}

/** A quiet text link under a button (secondary action). */
export function textLink(label: string, url: string, palette: EmailPalette): string {
  const href = safeUrl(url);
  if (!href) return "";
  return `<p style="margin:14px 0 0;text-align:center;font-family:${SANS};font-size:13px;"><a href="${escapeHtml(href)}" style="color:${palette.accent};text-decoration:underline;">${escapeHtml(label)}</a></p>`;
}

// ─── the shell ──────────────────────────────────────────────────────────────────────────────────────────────────

export function renderEmailLayout(input: EmailLayoutInput): string {
  const { brand, preheader, eyebrow, heading, bodyHtml, cta, secondary, footerNote } = input;
  const palette = emailPalette(brand.primaryColor);
  const logo = emailLogoUrl(brand);
  const site = safeUrl(brand.siteUrl ?? null);
  const headerBg = palette.darkHeader ? palette.brand : "#ffffff";
  const headerInk = palette.darkHeader ? palette.onBrand : palette.accent;

  const identity = logo
    ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(brand.name)}" height="44" style="display:block;margin:0 auto;height:44px;max-width:220px;border:0;outline:none;text-decoration:none;font-family:${SERIF};font-size:22px;color:${headerInk};">`
    : `<span style="font-family:${SERIF};font-size:24px;line-height:1.25;letter-spacing:0.3px;color:${headerInk};word-break:break-word;">${escapeHtml(brand.name)}</span>`;

  const contactParts = [
    brand.phone ? `<a href="tel:${escapeHtml(brand.phone.replace(/[^\d+]/g, ""))}" style="color:${BODY};text-decoration:none;">${escapeHtml(brand.phone)}</a>` : "",
    brand.email ? `<a href="mailto:${escapeHtml(brand.email)}" style="color:${BODY};text-decoration:none;">${escapeHtml(brand.email)}</a>` : "",
    site ? `<a href="${escapeHtml(site)}" style="color:${palette.accent};text-decoration:none;">${escapeHtml(new URL(site).host)}</a>` : "",
  ].filter(Boolean);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:${palette.canvas};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${escapeHtml(preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${palette.canvas};">
  <tr>
    <td align="center" style="padding:32px 12px 40px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;border-collapse:separate;">
        <tr>
          <td style="background:#ffffff;border:1px solid ${palette.rule};border-radius:16px;overflow:hidden;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              <tr><td style="height:4px;line-height:4px;font-size:4px;background:${palette.brand};">&nbsp;</td></tr>
              <tr>
                <td align="center" style="padding:30px 32px 26px;background:${headerBg};${palette.darkHeader ? "" : `border-bottom:1px solid ${palette.rule};`}">
                  ${identity}
                </td>
              </tr>
              <tr>
                <td style="padding:34px 36px 8px;">
                  ${eyebrow ? `<p style="margin:0 0 10px;font-family:${SANS};font-size:11px;line-height:1.4;font-weight:700;letter-spacing:1.8px;text-transform:uppercase;color:${palette.accent};">${escapeHtml(eyebrow)}</p>` : ""}
                  <h1 style="margin:0 0 18px;font-family:${SERIF};font-size:27px;line-height:1.25;font-weight:normal;color:${INK};">${escapeHtml(heading)}</h1>
                  ${bodyHtml}
                </td>
              </tr>
              ${
                cta
                  ? `<tr><td style="padding:4px 36px 8px;">${button(cta.label, cta.url, palette)}${secondary ? textLink(secondary.label, secondary.url, palette) : ""}</td></tr>`
                  : ""
              }
              <tr>
                <td style="padding:18px 36px 34px;">
                  ${footerNote ? `${divider(palette, "8px 0 18px")}<p style="margin:0;font-family:${SANS};font-size:13px;line-height:1.6;color:${MUTED};">${escapeHtml(footerNote)}</p>` : ""}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:24px 24px 0;">
            <p style="margin:0 0 6px;font-family:${SERIF};font-size:16px;line-height:1.4;color:${INK};">${escapeHtml(brand.name)}</p>
            ${contactParts.length ? `<p style="margin:0;font-family:${SANS};font-size:12px;line-height:1.7;color:${BODY};word-break:break-word;">${contactParts.join(` &nbsp;&middot;&nbsp; `)}</p>` : ""}
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** Plain-text footer shared by every email's text part. */
export function textFooter(brand: EmailBrand): string {
  const site = safeUrl(brand.siteUrl ?? null);
  return ["—", brand.name, [brand.phone, brand.email, site].filter(Boolean).join(" · ")].filter(Boolean).join("\n");
}
