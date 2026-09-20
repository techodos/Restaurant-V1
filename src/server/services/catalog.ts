import type { MenuCategory, MenuItem, MenuItemSummary } from "@/shared/contract/models";
import { forRestaurant } from "@/server/context";
import { getMenuItem, listCategories, listMenuItems, type MenuListFilters } from "@/server/repositories/menu";

/** Public menu reads for a restaurant. */

export function getMenuCategories(restaurantId: string, options: { withCounts?: boolean } = {}): Promise<MenuCategory[]> {
  return listCategories(restaurantId, forRestaurant(restaurantId), options);
}

export function searchMenu(restaurantId: string, filters: MenuListFilters = {}): Promise<MenuItemSummary[]> {
  return listMenuItems(restaurantId, filters, forRestaurant(restaurantId));
}

export function findMenuItemBySlug(restaurantId: string, slug: string): Promise<MenuItem | null> {
  return getMenuItem(restaurantId, { slug }, forRestaurant(restaurantId), { includeUnavailable: true });
}
