import { assembleStorefrontContext } from "@/server/domain/storefront-context";
import { logger } from "@/server/logger";
import type { StorefrontData } from "@/server/repositories/storefront";
import type { MenuCategory } from "@/shared/contract/models";
import type { SnapshotStats, StorefrontMenuEntry, StorefrontSnapshot } from "./types";

/**
 * Turns freshly loaded data into an immutable, indexed snapshot. This is the
 * "validate, build indexes" step of a refresh: it either returns a complete
 * snapshot or throws, so a half-built snapshot can never replace a good one.
 */

export class SnapshotValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SnapshotValidationError";
  }
}

export function buildStorefrontSnapshot(
  data: StorefrontData,
  meta: { loadedAt: Date; loadDurationMs: number },
): StorefrontSnapshot {
  const { restaurant } = data;
  if (data.website && data.website.restaurantId !== restaurant.id) {
    throw new SnapshotValidationError("website does not belong to the restaurant");
  }

  const context = assembleStorefrontContext(
    restaurant,
    data.website,
    data.locations.filter((location) => location.isActive),
  );

  const menu: StorefrontMenuEntry[] = [];
  const itemsBySlug = new Map<string, StorefrontMenuEntry>();
  const seenIds = new Set<string>();
  const itemCounts = new Map<string, number>();
  for (const record of data.menu) {
    if (record.item.id !== record.summary.id) {
      throw new SnapshotValidationError(`menu item ${record.item.id} and its summary disagree`);
    }
    if (seenIds.has(record.item.id)) throw new SnapshotValidationError(`duplicate menu item ${record.item.id}`);
    seenIds.add(record.item.id);

    const entry: StorefrontMenuEntry = { item: record.item, summary: record.summary, popularity: record.popularity };
    if (itemsBySlug.has(entry.item.slug)) {
      // the database path returns an arbitrary row for a duplicate slug; keep the first (menu order)
      logger.warn("cache", "duplicate menu item slug in storefront snapshot", { slug: entry.item.slug });
    } else {
      itemsBySlug.set(entry.item.slug, entry);
    }
    menu.push(entry);
    itemCounts.set(record.summary.categoryId, (itemCounts.get(record.summary.categoryId) ?? 0) + 1);
  }

  const categoriesWithCounts: MenuCategory[] = data.categories.map((category) => ({
    ...category,
    itemCount: itemCounts.get(category.id) ?? 0,
  }));
  const categoriesBySlug = new Map(data.categories.map((category) => [category.slug, category] as const));

  const snapshot: StorefrontSnapshot = {
    loadedAt: meta.loadedAt.toISOString(),
    loadDurationMs: meta.loadDurationMs,
    context,
    locations: data.locations,
    deliveryZones: data.deliveryZones,
    pages: data.pages,
    homePage: data.pages.find((page) => page.isHome) ?? null,
    categories: data.categories,
    categoriesWithCounts,
    menu,
    reviews: data.reviews,
    index: { itemsBySlug, categoriesBySlug },
  };

  // Maps stay mutable at runtime, but nothing outside this module can reach them
  // except through `ReadonlyMap`; the data they point at is frozen here.
  return deepFreeze(snapshot);
}

export function snapshotStats(snapshot: StorefrontSnapshot): SnapshotStats {
  return {
    items: snapshot.menu.length,
    categories: snapshot.categories.length,
    locations: snapshot.locations.length,
    deliveryZones: snapshot.deliveryZones.length,
    pages: snapshot.pages.length,
    reviews: snapshot.reviews.recent.length,
  };
}

/** Freezes plain objects and arrays reachable from `value`; Maps are left alone (their values are frozen). */
function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (typeof value !== "object" || value === null || seen.has(value)) return value;
  seen.add(value);
  if (value instanceof Map) {
    for (const entry of value.values()) deepFreeze(entry, seen);
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}
