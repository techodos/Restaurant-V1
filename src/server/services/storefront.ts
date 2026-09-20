import type { StorefrontContext, Website, WebsitePage } from "@/shared/contract/models";
import { themeSchema, type RestaurantTheme, type WebsiteConfig } from "@/shared/contract/settings";
import { errors } from "@/server/errors";
import { forRestaurant } from "@/server/context";
import { getRestaurantBySlug, listLocations } from "@/server/repositories/restaurants";
import { getHomePage, getWebsite } from "@/server/repositories/websites";

/**
 * Everything the storefront shell needs for a restaurant in one place:
 * restaurant → website → theme (with safe fallbacks) → locations.
 */

const DEFAULT_WEBSITE_CONFIG: WebsiteConfig = {
  announcement: { enabled: false, text: "" },
  navigation: { items: [], showCart: true, sticky: true },
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

export async function loadStorefrontContext(slug: string): Promise<StorefrontContext> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant || restaurant.status === "suspended" || restaurant.status === "closed") {
    throw errors.notFound("Restaurant");
  }

  const ctx = forRestaurant(restaurant.id);
  const [website, locations] = await Promise.all([
    getWebsite(restaurant.id, ctx),
    listLocations(restaurant.id, ctx, { activeOnly: true }),
  ]);

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

export function getHomePageContent(restaurantId: string): Promise<WebsitePage | null> {
  return getHomePage(restaurantId, forRestaurant(restaurantId));
}
