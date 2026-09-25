import type {
  DeliveryZone,
  MenuCategory,
  MenuItem,
  MenuItemSummary,
  RatingBreakdown,
  RestaurantLocation,
  Review,
  WebsitePage,
} from "@/shared/contract/models";
import type { MenuSearchFilters, StorefrontMenuEntry, StorefrontSnapshot } from "./types";

/**
 * Storefront reads answered from a snapshot. Each function mirrors the filter,
 * order and limit semantics of the repository query it replaces, so callers
 * cannot tell whether data came from memory or PostgreSQL. Results are fresh
 * arrays (safe to sort or slice); the objects inside are shared and frozen.
 */

const DEFAULT_MENU_LIMIT = 200;
const MAX_MENU_LIMIT = 500;

export function readMenuCategories(snapshot: StorefrontSnapshot, options: { withCounts?: boolean } = {}): MenuCategory[] {
  return [...(options.withCounts ? snapshot.categoriesWithCounts : snapshot.categories)];
}

export function readMenuItem(snapshot: StorefrontSnapshot, slug: string): MenuItem | null {
  return snapshot.index.itemsBySlug.get(slug)?.item ?? null;
}

export function readHomePage(snapshot: StorefrontSnapshot): WebsitePage | null {
  return snapshot.homePage;
}

/** A published non-home page (about, contact, ...); the snapshot only holds published pages. */
export function readPageBySlug(snapshot: StorefrontSnapshot, slug: string): WebsitePage | null {
  return snapshot.pages.find((page) => page.slug === slug && !page.isHome) ?? null;
}

export function readLocations(snapshot: StorefrontSnapshot, options: { activeOnly?: boolean } = {}): RestaurantLocation[] {
  return snapshot.locations.filter((location) => !options.activeOnly || location.isActive);
}

export function readDeliveryZones(
  snapshot: StorefrontSnapshot,
  options: { locationId?: string; activeOnly?: boolean } = {},
): DeliveryZone[] {
  return snapshot.deliveryZones.filter(
    (zone) => (!options.locationId || zone.locationId === options.locationId) && (!options.activeOnly || zone.isActive),
  );
}

export function readPublicReviews(
  snapshot: StorefrontSnapshot,
  filters: { limit?: number; featuredOnly?: boolean } = {},
): Review[] {
  const limit = Math.max(0, Math.min(filters.limit ?? 6, 50));
  const pool = filters.featuredOnly ? snapshot.reviews.recent.filter((review) => review.isFeatured) : snapshot.reviews.recent;
  return pool.slice(0, limit);
}

export function readReviewSummary(snapshot: StorefrontSnapshot): RatingBreakdown {
  return snapshot.reviews.summary;
}

export function readMenuItems(snapshot: StorefrontSnapshot, filters: MenuSearchFilters = {}): MenuItemSummary[] {
  const search = filters.search?.trim().toLowerCase();
  const slugs = filters.slugs?.length ? new Set(filters.slugs) : null;
  const ids = filters.ids?.length ? new Set(filters.ids) : null;
  const excluded = filters.excludeIds?.length ? new Set(filters.excludeIds) : null;
  const dietary = filters.dietaryTags?.length ? new Set(filters.dietaryTags) : null;

  const matches = snapshot.menu.filter(({ item, summary }) => {
    if (filters.availableOnly && !item.isAvailable) return false;
    if (filters.featuredOnly && !item.isFeatured) return false;
    if (filters.categoryId && summary.categoryId !== filters.categoryId) return false;
    if (filters.categorySlug && summary.categorySlug !== filters.categorySlug) return false;
    if (slugs && !slugs.has(summary.slug)) return false;
    if (ids && !ids.has(summary.id)) return false;
    if (excluded?.has(summary.id)) return false;
    if (dietary && !summary.dietaryTags.some((tag) => dietary.has(tag))) return false;
    if (search) {
      const haystack = `${summary.name}\n${summary.description ?? ""}\n${summary.categoryName ?? ""}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  const ordered = sortEntries(matches, filters.orderBy);
  const limit = Math.min(Math.max(filters.limit ?? DEFAULT_MENU_LIMIT, 1), MAX_MENU_LIMIT);
  const offset = Math.max(filters.offset ?? 0, 0);
  return ordered.slice(offset, offset + limit).map((entry) => entry.summary);
}

/** `snapshot.menu` is already in menu order, so that order is a no-op. */
function sortEntries(entries: StorefrontMenuEntry[], orderBy: MenuSearchFilters["orderBy"]): StorefrontMenuEntry[] {
  const byItemOrder = (a: StorefrontMenuEntry, b: StorefrontMenuEntry) => a.item.sortOrder - b.item.sortOrder;
  switch (orderBy) {
    case "price_asc":
      return entries.sort((a, b) => Number(a.item.basePrice) - Number(b.item.basePrice) || byItemOrder(a, b));
    case "price_desc":
      return entries.sort((a, b) => Number(b.item.basePrice) - Number(a.item.basePrice) || byItemOrder(a, b));
    case "name":
      return entries.sort((a, b) => a.item.name.localeCompare(b.item.name));
    case "popularity":
      return entries.sort((a, b) => b.popularity - a.popularity || byItemOrder(a, b));
    default:
      return entries;
  }
}
