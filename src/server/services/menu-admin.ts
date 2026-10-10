import type { RequestContext } from "@/server/context";
import { errors } from "@/server/errors";
import { assertBranchAccess, type ScopedActor } from "@/server/auth/branch-scope";
import { getStorefrontCache } from "@/server/cache";
import type { MenuAddonGroup, MenuCategory, MenuItem, MenuItemSummary } from "@/shared/contract/models";
import {
  createAddon,
  createAddonGroup,
  createCategory,
  createMenuItem,
  createVariant,
  deleteAddon,
  deleteAddonGroup,
  deleteCategory,
  deleteMenuItem,
  deleteVariant,
  getItemLocationOverrides,
  getLocationItemOverrides,
  getMenuItem,
  listBranchUnavailableItems,
  listCategories,
  listMenuItems,
  setItemLocationAvailability as repoSetItemLocationAvailability,
  setMenuItemAvailability,
  updateAddon,
  updateAddonGroup,
  updateCategory,
  updateMenuItem,
  updateVariant,
  type AddonGroupInput,
  type AddonInput,
  type CategoryInput,
  type CreateMenuItemInput,
  type MenuListFilters,
  type VariantInput,
} from "@/server/repositories/menu";

/**
 * Menu writes for the admin panel. Wraps `repositories/menu.ts` (which already
 * does the real CRUD) and invalidates the in-memory storefront snapshot after
 * every commit (SKILL.md §15) so admin edits show up on the storefront without
 * waiting for the next scheduled refresh.
 */

export function listCategoriesForAdmin(restaurantId: string, ctx: RequestContext): Promise<MenuCategory[]> {
  return listCategories(restaurantId, ctx, { includeInactive: true, withCounts: true });
}

export async function saveCategory(
  restaurantId: string,
  input: CategoryInput & { id?: string },
  ctx: RequestContext,
): Promise<MenuCategory> {
  const category = input.id
    ? await updateCategory(input.id, input, ctx)
    : await createCategory(restaurantId, input, ctx);
  getStorefrontCache().invalidate();
  return category;
}

export async function removeCategory(categoryId: string, ctx: RequestContext): Promise<void> {
  await deleteCategory(categoryId, ctx);
  getStorefrontCache().invalidate();
}

export function listMenuItemsForAdmin(
  restaurantId: string,
  filters: MenuListFilters,
  ctx: RequestContext,
): Promise<MenuItemSummary[]> {
  return listMenuItems(restaurantId, { ...filters, includeInactive: true }, ctx);
}

export function getMenuItemForAdmin(restaurantId: string, itemId: string, ctx: RequestContext): Promise<MenuItem | null> {
  return getMenuItem(restaurantId, { id: itemId }, ctx, { includeUnavailable: true });
}

export async function saveMenuItem(
  restaurantId: string,
  input: CreateMenuItemInput & { id?: string },
  ctx: RequestContext,
): Promise<MenuItem> {
  const item = input.id ? await updateMenuItem(input.id, input, ctx) : await createMenuItem(restaurantId, input, ctx);
  getStorefrontCache().invalidate();
  return item;
}

export async function removeMenuItem(itemId: string, ctx: RequestContext): Promise<void> {
  await deleteMenuItem(itemId, ctx);
  getStorefrontCache().invalidate();
}

export async function setItemAvailability(
  itemId: string,
  patch: { isAvailable?: boolean; isActive?: boolean; isFeatured?: boolean },
  ctx: RequestContext,
): Promise<MenuItem> {
  const item = await setMenuItemAvailability(itemId, patch, ctx);
  getStorefrontCache().invalidate();
  return item;
}

/**
 * Switches one item on/off at one branch. The branch and item come from the browser, so both are checked:
 * the branch must be THIS restaurant's and inside the caller's reach (branch staff: their own only), and
 * the item must be this restaurant's. 0029's write guard repeats the branch/tenant check in the database.
 */
export async function setItemLocationAvailability(
  restaurantId: string,
  locationId: string,
  itemId: string,
  isAvailable: boolean,
  ctx: RequestContext,
  actor: ScopedActor,
): Promise<void> {
  assertBranchAccess(actor, locationId); // no database: the actor's own branch is on the session
  if (!(await repoSetItemLocationAvailability(restaurantId, locationId, itemId, isAvailable, ctx))) {
    throw errors.notFound("Branch or menu item");
  }
  getStorefrontCache().invalidate();
}

export function getItemLocationOverridesForAdmin(itemId: string, ctx: RequestContext): Promise<Map<string, boolean>> {
  return getItemLocationOverrides(itemId, ctx);
}

/** Every branch's switched-off items (location id -> item ids): the menu list's "All branches" view. */
export function listBranchUnavailableItemsForAdmin(restaurantId: string, ctx: RequestContext): Promise<Record<string, string[]>> {
  return listBranchUnavailableItems(restaurantId, ctx);
}

/** One branch's availability for every item, keyed by item id (missing = available): the menu list's branch view. */
export function getLocationItemOverridesForAdmin(locationId: string, ctx: RequestContext): Promise<Map<string, boolean>> {
  return getLocationItemOverrides(locationId, ctx);
}

export async function saveVariant(
  restaurantId: string,
  menuItemId: string,
  input: VariantInput & { id?: string },
  ctx: RequestContext,
): Promise<void> {
  if (input.id) await updateVariant(input.id, input, ctx);
  else await createVariant(restaurantId, menuItemId, input, ctx);
  getStorefrontCache().invalidate();
}

export async function removeVariant(variantId: string, ctx: RequestContext): Promise<void> {
  await deleteVariant(variantId, ctx);
  getStorefrontCache().invalidate();
}

export async function saveAddonGroup(
  restaurantId: string,
  menuItemId: string,
  input: AddonGroupInput & { id?: string },
  ctx: RequestContext,
): Promise<MenuAddonGroup | void> {
  const group = input.id ? await updateAddonGroup(input.id, input, ctx) : await createAddonGroup(restaurantId, menuItemId, input, ctx);
  getStorefrontCache().invalidate();
  return group;
}

export async function removeAddonGroup(groupId: string, ctx: RequestContext): Promise<void> {
  await deleteAddonGroup(groupId, ctx);
  getStorefrontCache().invalidate();
}

export async function saveAddon(
  restaurantId: string,
  addonGroupId: string,
  input: AddonInput & { id?: string },
  ctx: RequestContext,
): Promise<void> {
  if (input.id) await updateAddon(input.id, input, ctx);
  else await createAddon(restaurantId, addonGroupId, input, ctx);
  getStorefrontCache().invalidate();
}

export async function removeAddon(addonId: string, ctx: RequestContext): Promise<void> {
  await deleteAddon(addonId, ctx);
  getStorefrontCache().invalidate();
}
