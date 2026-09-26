import type { Restaurant, RestaurantLocation, StorefrontContext, Website } from "@/shared/contract/models";
import { themeSchema, type RestaurantTheme, type WebsiteConfig } from "@/shared/contract/settings";

/**
 * Pure assembly of the storefront shell: restaurant → website → theme (with safe
 * fallbacks) → locations. Shared by the database-backed service path and the
 * in-memory snapshot builder so both produce the same context.
 */

const DEFAULT_WEBSITE_CONFIG: WebsiteConfig = {
  announcement: { enabled: false, text: "" },
  navigation: { items: [], showCart: true, sticky: true, tone: "dark" },
  footer: { columns: [], tagline: undefined, legalNote: undefined },
  ordering: {
    defaultOrderType: "delivery",
    allowGuestCheckout: true,
    showPrepTime: true,
    ctaLabel: "Order now",
  },
  contact: { showWhatsapp: true },
  social: {},
};

/** Theme values are untrusted JSONB: parse, fill gaps, never throw. */
export function resolveTheme(raw: unknown, fallbackPrimary?: string | null): RestaurantTheme {
  const parsed = themeSchema.safeParse(raw ?? {});
  const theme = parsed.success ? parsed.data : themeSchema.parse({});
  if (fallbackPrimary && /^#[0-9a-fA-F]{6}$/.test(fallbackPrimary) && !parsed.success) {
    theme.primary = fallbackPrimary;
  }
  return theme;
}

/** `locations` must already be the active ones, in display order. */
export function assembleStorefrontContext(
  restaurant: Restaurant,
  website: Website | null,
  locations: RestaurantLocation[],
): StorefrontContext {
  const theme = resolveTheme(website?.theme ?? {}, restaurant.primaryColor);
  const config = website?.config ?? DEFAULT_WEBSITE_CONFIG;
  const fallbackWebsite: Website = {
    id: "",
    restaurantId: restaurant.id,
    name: restaurant.name,
    domain: null,
    subdomain: null,
    status: "published",
    isPrimary: true,
    theme,
    config,
    seo: {},
    publishedAt: null,
  };

  return {
    restaurant,
    website: website ?? fallbackWebsite,
    theme,
    config,
    locations,
    primaryLocation: locations.find((location) => location.isPrimary) ?? locations[0] ?? null,
  };
}

/** Restaurants that are suspended or closed do not have a public storefront. */
export function isStorefrontPublic(restaurant: Restaurant): boolean {
  return restaurant.status !== "suspended" && restaurant.status !== "closed";
}
