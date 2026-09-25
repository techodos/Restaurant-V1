import type { RestaurantTheme } from "@/shared/contract/settings";

/** Presentation only: turns a resolved theme into CSS custom properties. */

const FONT_STACKS: Record<string, string> = {
  // the two fonts next/font loads (app/layout.tsx) go through its variables so the self-hosted file is used
  "playfair display": 'var(--font-display-fallback), "Playfair Display", "Iowan Old Style", Georgia, serif',
  "dm serif display": '"DM Serif Display", Georgia, serif',
  "cormorant garamond": '"Cormorant Garamond", Georgia, serif',
  "libre baskerville": '"Libre Baskerville", Georgia, serif',
  merriweather: "Merriweather, Georgia, serif",
  lora: "Lora, Georgia, serif",
  inter: 'var(--font-sans-fallback), Inter, -apple-system, "Segoe UI", Roboto, sans-serif',
  "dm sans": '"DM Sans", -apple-system, "Segoe UI", Roboto, sans-serif',
  manrope: 'Manrope, -apple-system, "Segoe UI", Roboto, sans-serif',
  poppins: 'Poppins, -apple-system, "Segoe UI", Roboto, sans-serif',
  "source sans 3": '"Source Sans 3", -apple-system, "Segoe UI", Roboto, sans-serif',
  georgia: 'Georgia, "Times New Roman", serif',
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
};

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
  };
}
