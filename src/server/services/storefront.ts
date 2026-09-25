import type { StorefrontContext, WebsitePage } from "@/shared/contract/models";
import { readHomePage, readPageBySlug, snapshotForRestaurant, snapshotForSlug } from "@/server/cache";
import { assembleStorefrontContext, isStorefrontPublic, resolveTheme } from "@/server/domain/storefront-context";
import { errors } from "@/server/errors";
import { forRestaurant } from "@/server/context";
import { getRestaurantBySlug, listLocations } from "@/server/repositories/restaurants";
import { getHomePage, getPageBySlug, getWebsite } from "@/server/repositories/websites";

/**
 * Everything the storefront shell needs for a restaurant in one place:
 * restaurant → website → theme (with safe fallbacks) → locations.
 *
 * Served from the in-memory storefront snapshot; with the cache switched off
 * (STOREFRONT_CACHE_ENABLED=false) it reads the database exactly as before.
 */

export { resolveTheme };

export async function loadStorefrontContext(slug: string): Promise<StorefrontContext> {
  const snapshot = snapshotForSlug(slug);
  if (snapshot) {
    if (!isStorefrontPublic(snapshot.context.restaurant)) throw errors.notFound("Restaurant");
    return snapshot.context;
  }

  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant || !isStorefrontPublic(restaurant)) {
    throw errors.notFound("Restaurant");
  }

  const ctx = forRestaurant(restaurant.id);
  const [website, locations] = await Promise.all([
    getWebsite(restaurant.id, ctx),
    listLocations(restaurant.id, ctx, { activeOnly: true }),
  ]);
  return assembleStorefrontContext(restaurant, website, locations);
}

export async function getHomePageContent(restaurantId: string): Promise<WebsitePage | null> {
  const snapshot = snapshotForRestaurant(restaurantId);
  if (snapshot) return readHomePage(snapshot);
  return getHomePage(restaurantId, forRestaurant(restaurantId));
}

/** A published page other than home (`/r/<slug>/about`); null when it does not exist or is unpublished. */
export async function getPageContent(restaurantId: string, slug: string): Promise<WebsitePage | null> {
  const snapshot = snapshotForRestaurant(restaurantId);
  if (snapshot) return readPageBySlug(snapshot, slug);
  const page = await getPageBySlug(restaurantId, slug, forRestaurant(restaurantId), { publishedOnly: true });
  return page && !page.isHome ? page : null;
}
