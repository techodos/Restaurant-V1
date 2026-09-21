import { forRestaurant } from "@/server/context";
import type {
  DeliveryZone,
  MenuCategory,
  RatingBreakdown,
  Restaurant,
  RestaurantLocation,
  Review,
  Website,
  WebsitePage,
} from "@/shared/contract/models";
import { listDeliveryZones } from "./deliveries";
import { listCategories, listStorefrontMenu, type StorefrontMenuRecord } from "./menu";
import { getRestaurantBySlug, listLocations } from "./restaurants";
import { getRatingBreakdown, listPublicReviews } from "./reviews";
import { getWebsite, listPublishedPages } from "./websites";

/**
 * Everything the public storefront renders from one restaurant, read in one
 * pass for the in-memory snapshot (see `server/cache`). No SQL lives here: it
 * composes the per-aggregate readers so the storefront's queries are defined
 * once, and runs the independent ones concurrently — each on its own pooled
 * connection, because a single connection executes statements one at a time and
 * a hosted database pays a full round trip for each.
 *
 * Only public, read-mostly data. Carts, orders, payments, reservations and
 * customer data are deliberately not part of this read model.
 */

/** Public reviews shown on the storefront never exceed this (`listPublicReviews` caps at 50). */
export const STOREFRONT_REVIEW_LIMIT = 50;

export interface StorefrontData {
  restaurant: Restaurant;
  website: Website | null;
  /** published pages, home page first */
  pages: WebsitePage[];
  /** all locations, active or not, in display order */
  locations: RestaurantLocation[];
  /** all delivery zones, active or not, in display order */
  deliveryZones: DeliveryZone[];
  /** active categories in display order (no item counts) */
  categories: MenuCategory[];
  /** active items in menu order */
  menu: StorefrontMenuRecord[];
  reviews: { summary: RatingBreakdown; recent: Review[] };
}

/** `null` when no restaurant has that slug. */
export async function loadStorefrontData(slug: string): Promise<StorefrontData | null> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) return null;

  const ctx = forRestaurant(restaurant.id);
  const [website, pages, locations, deliveryZones, categories, menu, recent, summary] = await Promise.all([
    getWebsite(restaurant.id, ctx),
    listPublishedPages(restaurant.id, ctx),
    listLocations(restaurant.id, ctx),
    listDeliveryZones(restaurant.id, ctx),
    listCategories(restaurant.id, ctx),
    listStorefrontMenu(restaurant.id, ctx),
    listPublicReviews(restaurant.id, { limit: STOREFRONT_REVIEW_LIMIT }, ctx),
    getRatingBreakdown(restaurant.id, ctx),
  ]);

  return { restaurant, website, pages, locations, deliveryZones, categories, menu, reviews: { summary, recent } };
}
