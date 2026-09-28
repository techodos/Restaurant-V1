import type { MenuCategory, MenuItem, MenuItemSummary } from "@/shared/contract/models";
import { readMenuCategories, readMenuEntryById, readMenuItem, readMenuItems, snapshotForRestaurant, type MenuSearchFilters } from "@/server/cache";
import { forRestaurant } from "@/server/context";
import type { OrderableMenuItem } from "@/server/domain/menu-selection";
import { getMenuItem, listCategories, listMenuItems, listOrderableItems } from "@/server/repositories/menu";

/**
 * Public menu reads for a restaurant, served from the in-memory storefront
 * snapshot (database when STOREFRONT_CACHE_ENABLED=false). The tray PREVIEW (cart and checkout pages)
 * is priced from these too; the order itself is re-priced from the database inside its transaction.
 */

export async function getMenuCategories(restaurantId: string, options: { withCounts?: boolean } = {}): Promise<MenuCategory[]> {
  const snapshot = snapshotForRestaurant(restaurantId);
  if (snapshot) return readMenuCategories(snapshot, options);
  return listCategories(restaurantId, forRestaurant(restaurantId), options);
}

export async function searchMenu(restaurantId: string, filters: MenuSearchFilters = {}): Promise<MenuItemSummary[]> {
  const snapshot = snapshotForRestaurant(restaurantId);
  if (snapshot) return readMenuItems(snapshot, filters);
  return listMenuItems(restaurantId, filters, forRestaurant(restaurantId));
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
export async function getOrderableMenuItems(restaurantId: string, itemIds: readonly string[]): Promise<Map<string, OrderableMenuItem>> {
  const snapshot = snapshotForRestaurant(restaurantId);
  if (!snapshot) return listOrderableItems(restaurantId, itemIds, forRestaurant(restaurantId));
  const found = new Map<string, OrderableMenuItem>();
  for (const id of itemIds) {
    const entry = readMenuEntryById(snapshot, id);
    if (!entry) continue;
    const category = snapshot.categories.find((candidate) => candidate.id === entry.item.categoryId);
    found.set(id, { item: entry.item, category: category ? { isActive: category.isActive, availability: category.availability } : null });
  }
  return found;
}
