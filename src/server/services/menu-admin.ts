import type { RequestContext } from "@/server/context";
import { errors } from "@/server/errors";
import { assertBranchAccess, type ScopedActor } from "@/server/auth/branch-scope";
import { getStorefrontCache } from "@/server/cache";
import { logger } from "@/server/logger";
import type { MediaAsset, MenuAddonGroup, MenuCategory, MenuItem, MenuItemSummary } from "@/shared/contract/models";
import { menuImageProblem } from "@/shared/media-upload";
import { createMedia, deleteMedia, findMediaByUrl, findMediaUsage } from "@/server/repositories/media";
import { deleteStoredMedia, uploadMedia } from "@/server/integrations/storage";
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

/** Returns the photo addresses that went with the category and its items; pass them to `releaseMenuImages`. */
export async function removeCategory(categoryId: string, ctx: RequestContext): Promise<string[]> {
  const images = await deleteCategory(categoryId, ctx);
  getStorefrontCache().invalidate();
  return images;
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

/** `replacedImageUrl`: the photo this save replaced or removed (pass it to `releaseMenuImages`), else null. */
export async function saveMenuItem(
  restaurantId: string,
  input: CreateMenuItemInput & { id?: string },
  ctx: RequestContext,
): Promise<{ item: MenuItem; replacedImageUrl: string | null }> {
  if (!input.id) {
    const item = await createMenuItem(restaurantId, input, ctx);
    getStorefrontCache().invalidate();
    return { item, replacedImageUrl: null };
  }
  const { item, previousImageUrl } = await updateMenuItem(input.id, input, ctx);
  getStorefrontCache().invalidate();
  return { item, replacedImageUrl: previousImageUrl && previousImageUrl !== item.imageUrl ? previousImageUrl : null };
}

/** Returns the deleted item's photo address; pass it to `releaseMenuImages`. */
export async function removeMenuItem(itemId: string, ctx: RequestContext): Promise<string | null> {
  const image = await deleteMenuItem(itemId, ctx);
  getStorefrontCache().invalidate();
  return image;
}

/**
 * One dish photo from the admin's device: checked against `shared/media-upload.ts` (type, 4 MB), stored by
 * `integrations/storage.ts` (Supabase Storage, or `.uploads/` locally) and recorded as a `media` row
 * (`purpose = 'menu_item'`). Returns the public URL for the item's `imageUrl`; the item itself changes only when the
 * form is saved.
 */
export async function uploadMenuImage(
  restaurantId: string,
  file: { name: string; type: string; size: number; arrayBuffer: () => Promise<ArrayBuffer> },
  ctx: RequestContext,
): Promise<MediaAsset> {
  const problem = menuImageProblem(file);
  if (problem) throw errors.validation(problem);
  const stored = await uploadMedia(restaurantId, file);
  try {
    return await createMedia(restaurantId, { ...stored, purpose: "menu_item" }, ctx);
  } catch (error) {
    // no orphaned file when the row cannot be written
    await deleteStoredMedia(stored.bucket, stored.path);
    throw error;
  }
}

/**
 * Deletes dish photos that were UPLOADED here (`media.purpose = 'menu_item'`) and that nothing uses any more: the
 * `media` row and the stored file. Anything else is left alone: seeded `/images/...` paths, hand-typed addresses, a
 * super admin's library upload, or a photo another dish/category/page still shows. Never throws (it runs after the
 * write that freed the photo has committed); returns how many were deleted.
 */
export async function releaseMenuImages(restaurantId: string, urls: readonly (string | null)[], ctx: RequestContext): Promise<number> {
  let released = 0;
  for (const url of new Set(urls.filter((value): value is string => Boolean(value)))) {
    try {
      const media = await findMediaByUrl(restaurantId, url, ctx);
      if (!media || media.purpose !== "menu_item") continue;
      if ((await findMediaUsage(restaurantId, url, ctx)).length > 0) continue;
      await deleteMedia(media.id, ctx);
      await deleteStoredMedia(media.bucket, media.path);
      released += 1;
    } catch (error) {
      logger.warn("storage", "could not release a menu photo", { url, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return released;
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
