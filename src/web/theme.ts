import type { RestaurantTheme } from "@/shared/contract/settings";

/** Presentation only: turns a resolved theme into CSS custom properties. */

// Every catalogue name maps to its self-hosted next/font variable (web/fonts.ts) first, then fallbacks.
const SERIF = '"Iowan Old Style", Georgia, serif';
const SANS = '-apple-system, "Segoe UI", Roboto, sans-serif';
const FONT_STACKS: Record<string, string> = {
  "playfair display": `var(--font-playfair), ${SERIF}`,
  "dm serif display": `var(--font-dm-serif), ${SERIF}`,
  "cormorant garamond": `var(--font-cormorant), ${SERIF}`,
  "libre baskerville": `var(--font-baskerville), ${SERIF}`,
  merriweather: `var(--font-merriweather), ${SERIF}`,
  lora: `var(--font-lora), ${SERIF}`,
  inter: `var(--font-inter), ${SANS}`,
  "dm sans": `var(--font-dm-sans), ${SANS}`,
  manrope: `var(--font-manrope), ${SANS}`,
  poppins: `var(--font-poppins), ${SANS}`,
  "source sans 3": `var(--font-source-sans), ${SANS}`,
  anton: `var(--font-anton), Impact, "Arial Narrow", sans-serif`,
  georgia: 'Georgia, "Times New Roman", serif',
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
};

/**
 * The weight every display heading uses (globals.css `--display-weight`), chosen for the face so no component has
 * to: one-weight faces (web/fonts.ts loads DM Serif Display and Anton at 400 only) stay 400 and are never faux-bolded;
 * a delicate serif (Cormorant) needs 600 to read at all; Libre Baskerville has 400/700 only, and 700 is too heavy at
 * display sizes; a sans used as the heading face needs 600 to separate from body text. Everything else: 500.
 */
const DISPLAY_WEIGHTS: Record<string, string> = {
  anton: "400",
  "dm serif display": "400",
  "libre baskerville": "400",
  "cormorant garamond": "600",
  inter: "600",
  "dm sans": "600",
  manrope: "600",
  poppins: "600",
  "source sans 3": "600",
};
const SINGLE_WEIGHT_HEADINGS = new Set(["anton", "dm serif display"]);

const RADIUS: Record<RestaurantTheme["radius"], string> = {
  none: "0px",
  sm: "4px",
  md: "8px",
  lg: "14px",
  xl: "22px",
  full: "9999px",
};

export function fontStack(name: string | undefined, fallback: "serif" | "sans"): string {
  const key = (name ?? "").trim().toLowerCase();
  return (
    FONT_STACKS[key] ??
    (fallback === "serif"
      ? 'Georgia, "Times New Roman", serif'
      : 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif')
  );
}

/** globals.css reads these: the heading weight for the face, and no faux bold for a one-weight face */
function displayFaceTokens(font: string | undefined): Record<string, string> {
  const key = (font ?? "").trim().toLowerCase();
  return {
    "--display-weight": DISPLAY_WEIGHTS[key] ?? "500",
    ...(SINGLE_WEIGHT_HEADINGS.has(key) ? { "--display-synthesis": "none" } : {}),
    // the condensed poster face needs air between its capitals; a regular serif keeps the scale's negative tracking
    ...(key === "anton" ? { "--display-tracking": "0.012em" } : {}),
  };
}

export function themeCssVariables(theme: RestaurantTheme): Record<string, string> {
  const vars: Record<string, string> = {
    "--brand-primary": theme.primary,
    "--brand-primary-foreground": theme.primaryForeground,
    "--brand-secondary": theme.secondary,
    "--brand-accent": theme.accent,
    "--brand-background": theme.background,
    "--brand-surface": theme.surface,
    "--brand-foreground": theme.foreground,
    "--brand-muted": theme.muted,
    "--brand-border": theme.border,
    "--brand-font-heading": fontStack(theme.font, "serif"),
    "--brand-font-body": fontStack(theme.bodyFont, "sans"),
    "--brand-radius": RADIUS[theme.radius],
  };
  // globals.css declares the --color-* / --radius-* tokens as var(--brand-*) on :root, where a var() is resolved once
  // at :root, so a per-restaurant override on a wrapper never reaches them. Re-declare them on the wrapper too.
  return {
    ...vars,
    "--color-brand": vars["--brand-primary"]!,
    "--color-brand-foreground": vars["--brand-primary-foreground"]!,
    "--color-brand-secondary": vars["--brand-secondary"]!,
    "--color-brand-accent": vars["--brand-accent"]!,
    "--color-canvas": vars["--brand-background"]!,
    "--color-surface": vars["--brand-surface"]!,
    "--color-ink": vars["--brand-foreground"]!,
    "--color-muted-ink": vars["--brand-muted"]!,
    "--color-hairline": vars["--brand-border"]!,
    "--radius-brand": vars["--brand-radius"]!,
    // Same reason for the fonts: without these, headings fell back to Georgia and body text to system-ui.
    "--font-display": vars["--brand-font-heading"]!,
    "--font-sans": vars["--brand-font-body"]!,
    ...displayFaceTokens(theme.font),
    ...semanticTokens(theme),
  };
}

/**
 * The editorial tokens (dark "night" sections, a muted paper, status colours). Each one is the theme's
 * own value when set, otherwise derived from the core colours, so an older theme gets a night surface
 * tinted by its own secondary colour and a paper tinted by its own ink: never a fixed palette.
 */
function semanticTokens(theme: RestaurantTheme): Record<string, string> {
  return {
    "--color-night": theme.surfaceDark ?? `color-mix(in oklab, ${theme.secondary} 58%, #0a0a09)`,
    "--color-on-night": theme.foregroundOnDark ?? theme.background,
    "--color-canvas-muted": theme.surfaceMuted ?? `color-mix(in oklab, ${theme.foreground} 5%, ${theme.background})`,
    "--color-brand-accent-foreground": theme.accentForeground ?? theme.foreground,
    "--color-success": theme.success ?? "#2E7D4F",
    "--color-warning": theme.warning ?? "#B26B00",
    "--color-danger": theme.danger ?? "#B42318",
    "--color-info": theme.info ?? "#2F5E9E",
    // admin portal background: a pinned flat colour replaces the automatic brand/accent wash (globals.css reads both)
    ...(theme.adminBackground ? { "--color-admin-wash": theme.adminBackground, "--admin-wash-image": "none" } : {}),
  };
}
