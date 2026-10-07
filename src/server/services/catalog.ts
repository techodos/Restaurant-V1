import type { MenuCategory, MenuItem, MenuItemSummary } from "@/shared/contract/models";
import { readBranchUnavailable, readMenuCategories, readMenuEntryById, readMenuItem, readMenuItems, snapshotForRestaurant, type MenuSearchFilters } from "@/server/cache";
import { forRestaurant } from "@/server/context";
import type { OrderableMenuItem } from "@/server/domain/menu-selection";
import { getMenuItem, listBranchUnavailableItems, listCategories, listMenuItems, listOrderableItems } from "@/server/repositories/menu";

/**
 * Public menu reads for a restaurant, served from the in-memory storefront
 * snapshot (database when STOREFRONT_CACHE_ENABLED=false). The tray PREVIEW (cart and checkout pages)
 * is priced from these too; the order itself is re-priced from the database inside its transaction.
 */

/**
 * Off for a buffet-only restaurant, every non-buffet category/item is hidden — filtered once here
 * rather than at each of this file's several storefront call sites (menu page, home sections, item
 * detail's "related items", search), so a future new call site can't forget the flag and leak the
 * a la carte menu back in. Snapshot-only: the restaurant's features are already right there on the
 * snapshot at no extra cost. The rare `STOREFRONT_CACHE_ENABLED=false` debug/rollback path (no
 * snapshot) is intentionally left unfiltered rather than adding a surprise extra database round
 * trip to every menu read on that already-slow path — `tests/storefront-services.test.ts` pins
 * that path's repository call graph as exactly what it was before this flag existed.
 */
export async function getMenuCategories(restaurantId: string, options: { withCounts?: boolean } = {}): Promise<MenuCategory[]> {
  const snapshot = snapshotForRestaurant(restaurantId);
  if (!snapshot) return listCategories(restaurantId, forRestaurant(restaurantId), options);
  const categories = readMenuCategories(snapshot, options);
  if (snapshot.context.restaurant.features.alaCarteEnabled) return categories;
  const items = readMenuItems(snapshot, { limit: 500 });
  const buffetCategoryIds = new Set(items.filter((item) => item.isBuffetPackage).map((item) => item.categoryId));
  return categories.filter((category) => buffetCategoryIds.has(category.id));
}

export async function searchMenu(restaurantId: string, filters: MenuSearchFilters = {}): Promise<MenuItemSummary[]> {
  const snapshot = snapshotForRestaurant(restaurantId);
  if (!snapshot) return listMenuItems(restaurantId, filters, forRestaurant(restaurantId));
  const items = readMenuItems(snapshot, filters);
  if (snapshot.context.restaurant.features.alaCarteEnabled) return items;
  return items.filter((item) => item.isBuffetPackage);
}

export async function findMenuItemBySlug(restaurantId: string, slug: string): Promise<MenuItem | null> {
  const snapshot = snapshotForRestaurant(restaurantId);
  if (snapshot) return readMenuItem(snapshot, slug);
  return getMenuItem(restaurantId, { slug }, forRestaurant(restaurantId), { includeUnavailable: true });
}

/**
 * The menu entries a tray's lines name, keyed by item id, for the tray preview. An id missing from the
 * result is not on the (active) menu any more. Served from the snapshot, which holds active items and
 * active categories only; `resolveMenuSelection` applies every remaining rule.
 */
export async function getOrderableMenuItems(
  restaurantId: string,
  itemIds: readonly string[],
  /** the tray's branch: an item switched off there previews as unavailable, as the order would refuse it */
  locationId: string | null = null,
): Promise<Map<string, OrderableMenuItem>> {
  const snapshot = snapshotForRestaurant(restaurantId);
  if (!snapshot) return listOrderableItems(restaurantId, itemIds, forRestaurant(restaurantId), locationId);
  const offHere = new Set(locationId ? readBranchUnavailable(snapshot, locationId) : []);
  const found = new Map<string, OrderableMenuItem>();
  for (const id of itemIds) {
    const entry = readMenuEntryById(snapshot, id);
    if (!entry) continue;
    const category = snapshot.categories.find((candidate) => candidate.id === entry.item.categoryId);
    const item = offHere.has(id) ? { ...entry.item, isAvailable: false } : entry.item;
    found.set(id, { item, category: category ? { isActive: category.isActive, availability: category.availability } : null });
  }
  return found;
}

/** location id -> ids of the items switched off at that branch (snapshot; one read without it). */
export async function getBranchUnavailableItems(restaurantId: string): Promise<Readonly<Record<string, readonly string[]>>> {
  const snapshot = snapshotForRestaurant(restaurantId);
  if (snapshot) return snapshot.branchUnavailable;
  return listBranchUnavailableItems(restaurantId, forRestaurant(restaurantId));
}
