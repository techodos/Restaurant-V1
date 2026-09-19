import { cache } from "react";
import type { StorefrontContext } from "../contract/models";
import { themeSchema, type RestaurantTheme } from "../contract/settings";
import { errors } from "../errors";
import { getRestaurantBySlug, listLocations } from "../db/restaurants";
import { getWebsite } from "../db/websites";
import { EMPTY_CONTEXT } from "../db/pool";

/**
 * Resolves everything the storefront shell needs for a restaurant in one place:
 * restaurant → website → theme (with safe fallbacks) → locations.
 * Cached per request so layout + page do not query twice.
 */

const FONT_STACKS: Record<string, string> = {
  "playfair display": '"Playfair Display", "Iowan Old Style", Georgia, serif',
  "dm serif display": '"DM Serif Display", Georgia, serif',
  "cormorant garamond": '"Cormorant Garamond", Georgia, serif',
  "libre baskerville": '"Libre Baskerville", Georgia, serif',
  "merriweather": 'Merriweather, Georgia, serif',
  "lora": 'Lora, Georgia, serif',
  "inter": 'Inter, -apple-system, "Segoe UI", Roboto, sans-serif',
  "dm sans": '"DM Sans", -apple-system, "Segoe UI", Roboto, sans-serif',
  "manrope": 'Manrope, -apple-system, "Segoe UI", Roboto, sans-serif',
  "poppins": 'Poppins, -apple-system, "Segoe UI", Roboto, sans-serif',
  "source sans 3": '"Source Sans 3", -apple-system, "Segoe UI", Roboto, sans-serif',
  "georgia": 'Georgia, "Times New Roman", serif',
  "system": 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
};

export function fontStack(name: string | undefined, fallback: "serif" | "sans"): string {
  const key = (name ?? "").trim().toLowerCase();
  return (
    FONT_STACKS[key] ??
    (fallback === "serif" ? 'Georgia, "Times New Roman", serif' : 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif')
  );
}

/** Theme values are untrusted JSONB: parse, fill gaps, never throw. */
export function resolveTheme(raw: unknown, fallbackPrimary?: string | null): RestaurantTheme {
  const parsed = themeSchema.safeParse(raw ?? {});
  const theme = parsed.success ? parsed.data : themeSchema.parse({});
  if (fallbackPrimary && /^#[0-9a-fA-F]{6}$/.test(fallbackPrimary) && !parsed.success) {
    theme.primary = fallbackPrimary;
  }
  return theme;
}

export function themeCssVariables(theme: RestaurantTheme): Record<string, string> {
  return {
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
    "--brand-radius": { none: "0px", sm: "4px", md: "8px", lg: "14px", xl: "22px", full: "9999px" }[theme.radius],
  };
}

export const getStorefrontContext = cache(async (slug: string): Promise<StorefrontContext> => {
  const restaurant = await getRestaurantBySlug(slug, EMPTY_CONTEXT);
  if (!restaurant) throw errors.notFound("Restaurant");
  if (restaurant.status === "suspended" || restaurant.status === "closed") {
    throw errors.notFound("Restaurant");
  }

  const [website, locations] = await Promise.all([
    getWebsite(restaurant.id, EMPTY_CONTEXT),
    listLocations(restaurant.id, EMPTY_CONTEXT, { activeOnly: true }),
  ]);

  const theme = resolveTheme(website?.theme ?? {}, restaurant.primaryColor);
  const config = website?.config ?? null;

  return {
    restaurant,
    website: website ?? {
      id: "",
      restaurantId: restaurant.id,
      name: restaurant.name,
      domain: null,
      subdomain: null,
      status: "published",
      isPrimary: true,
      theme,
      config: {
        announcement: { enabled: false, text: "" },
        navigation: { items: [], showCart: true, sticky: true },
        footer: { columns: [], tagline: undefined, legalNote: undefined },
        ordering: { defaultOrderType: "delivery", allowGuestCheckout: true, showPrepTime: true, ctaLabel: "Order now" },
        contact: { showWhatsapp: true },
        social: {},
      },
      seo: {},
      publishedAt: null,
    },
    theme,
    config: config ?? {
      announcement: { enabled: false, text: "" },
      navigation: { items: [], showCart: true, sticky: true },
      footer: { columns: [], tagline: undefined, legalNote: undefined },
      ordering: { defaultOrderType: "delivery", allowGuestCheckout: true, showPrepTime: true, ctaLabel: "Order now" },
      contact: { showWhatsapp: true },
      social: {},
    },
    locations,
    primaryLocation: locations.find((location) => location.isPrimary) ?? locations[0] ?? null,
  };
});

export function restaurantPath(slug: string, path = ""): string {
  const suffix = path.startsWith("/") ? path : path ? `/${path}` : "";
  return `/r/${slug}${suffix}`;
}
