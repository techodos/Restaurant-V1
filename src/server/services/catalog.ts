import type { MenuCategory, MenuItem, MenuItemSummary } from "@/shared/contract/models";
import { readMenuCategories, readMenuItem, readMenuItems, snapshotForRestaurant, type MenuSearchFilters } from "@/server/cache";
import { forRestaurant } from "@/server/context";
import { getMenuItem, listCategories, listMenuItems } from "@/server/repositories/menu";

/**
 * Public menu reads for a restaurant, served from the in-memory storefront
 * snapshot (database when STOREFRONT_CACHE_ENABLED=false). Cart, checkout and
 * order pricing do not use these: they re-read prices from the database.
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
