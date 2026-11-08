"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { adminPath } from "@/shared/utils";
import type { ApiResult } from "@/shared/contract/api";
import type { MenuAddonGroup, MenuItem } from "@/shared/contract/models";
import { action, errors } from "@/server/errors";
import { addonGroupSchema, addonSchema, menuItemSchema, variantSchema } from "@/server/validation/menu";
import {
  removeAddon,
  removeAddonGroup,
  releaseMenuImages,
  removeVariant,
  saveAddon,
  saveAddonGroup,
  saveMenuItem,
  saveVariant,
  setItemLocationAvailability,
  uploadMenuImage,
} from "@/server/services/menu-admin";
import { requirePermission, requireRestaurantWidePermission } from "@/web/session";

// Items, prices, variants and add-ons are shared by every branch: owner/admin only
// (requireRestaurantWidePermission). A branch's availability is the one menu write branch managers make.

function normalize(value: string | undefined): string | null {
  return value && value.trim() ? value.trim() : null;
}

export async function saveMenuItemAction(payload: unknown): Promise<ApiResult<MenuItem>> {
  return action(async () => {
    const actor = await requireRestaurantWidePermission("menu.manage");
    const input = menuItemSchema.parse(payload);
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    const { item, replacedImageUrl } = await saveMenuItem(
      actor.restaurantId,
      {
        ...input,
        description: normalize(input.description),
        shortDescription: normalize(input.shortDescription),
        imageUrl: normalize(input.imageUrl),
        compareAtPrice: normalize(input.compareAtPrice),
      },
      ctx,
    );
    revalidatePath(adminPath("/menu"));
    revalidatePath(adminPath(`/menu/items/${item.id}`));
    // the replaced/removed photo's file is deleted after the response, only if it was uploaded here and is now unused
    if (replacedImageUrl) after(() => releaseMenuImages(actor.restaurantId, [replacedImageUrl], ctx));
    return item;
  });
}

/** One dish photo from the device (multipart `file`) → Supabase Storage + a `media` row; returns the URL for the form. */
export async function uploadMenuImageAction(formData: FormData): Promise<ApiResult<{ url: string }>> {
  return action(async () => {
    const actor = await requireRestaurantWidePermission("menu.manage");
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw errors.validation("Choose a photo to upload.");
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    const media = await uploadMenuImage(actor.restaurantId, file, ctx);
    return { url: media.url };
  });
}

/**
 * The form uploaded a photo and then replaced or removed it before saving: delete that upload again. Only a photo
 * uploaded here that nothing uses is deleted (`releaseMenuImages`), so passing a saved or seeded address is harmless.
 */
export async function discardMenuImageAction(url: string): Promise<ApiResult<null>> {
  return action(async () => {
    const actor = await requireRestaurantWidePermission("menu.manage");
    if (typeof url !== "string" || !url) return null;
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    after(() => releaseMenuImages(actor.restaurantId, [url], ctx));
    return null;
  });
}

export async function saveVariantAction(menuItemId: string, payload: unknown): Promise<ApiResult<null>> {
  return action(async () => {
    const actor = await requireRestaurantWidePermission("menu.manage");
    const input = variantSchema.parse(payload);
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    await saveVariant(actor.restaurantId, menuItemId, input, ctx);
    revalidatePath(adminPath(`/menu/items/${menuItemId}`));
    revalidatePath(adminPath("/menu")); // the list's branch view shows it too
    return null;
  });
}

export async function deleteVariantAction(menuItemId: string, variantId: string): Promise<ApiResult<null>> {
  return action(async () => {
    const actor = await requireRestaurantWidePermission("menu.manage");
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    await removeVariant(variantId, ctx);
    revalidatePath(adminPath(`/menu/items/${menuItemId}`));
    return null;
  });
}

export async function saveAddonGroupAction(menuItemId: string, payload: unknown): Promise<ApiResult<MenuAddonGroup | void>> {
  return action(async () => {
    const actor = await requireRestaurantWidePermission("menu.manage");
    const input = addonGroupSchema.parse(payload);
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    const group = await saveAddonGroup(actor.restaurantId, menuItemId, input, ctx);
    revalidatePath(adminPath(`/menu/items/${menuItemId}`));
    return group;
  });
}

export async function deleteAddonGroupAction(menuItemId: string, groupId: string): Promise<ApiResult<null>> {
  return action(async () => {
    const actor = await requireRestaurantWidePermission("menu.manage");
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    await removeAddonGroup(groupId, ctx);
    revalidatePath(adminPath(`/menu/items/${menuItemId}`));
    return null;
  });
}

export async function saveAddonAction(menuItemId: string, addonGroupId: string, payload: unknown): Promise<ApiResult<null>> {
  return action(async () => {
    const actor = await requireRestaurantWidePermission("menu.manage");
    const input = addonSchema.parse(payload);
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    await saveAddon(actor.restaurantId, addonGroupId, input, ctx);
    revalidatePath(adminPath(`/menu/items/${menuItemId}`));
    return null;
  });
}

export async function setItemLocationAvailabilityAction(
  menuItemId: string,
  locationId: string,
  isAvailable: boolean,
): Promise<ApiResult<null>> {
  return action(async () => {
    const actor = await requirePermission("menu.manage");
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    await setItemLocationAvailability(actor.restaurantId, locationId, menuItemId, isAvailable, ctx, actor);
    // no revalidatePath: it made Next re-render the whole open page into the response (the slow part of a
    // click). Every switch keeps its own state, and the admin pages are dynamic, so a visit reads fresh.
    return null;
  });
}

export async function deleteAddonAction(menuItemId: string, addonId: string): Promise<ApiResult<null>> {
  return action(async () => {
    const actor = await requireRestaurantWidePermission("menu.manage");
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    await removeAddon(addonId, ctx);
    revalidatePath(adminPath(`/menu/items/${menuItemId}`));
    return null;
  });
}
