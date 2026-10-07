"use server";

import { revalidatePath } from "next/cache";
import { adminPath } from "@/shared/utils";
import type { ApiResult } from "@/shared/contract/api";
import type { MenuAddonGroup, MenuItem } from "@/shared/contract/models";
import { action } from "@/server/errors";
import { addonGroupSchema, addonSchema, menuItemSchema, variantSchema } from "@/server/validation/menu";
import {
  removeAddon,
  removeAddonGroup,
  removeVariant,
  saveAddon,
  saveAddonGroup,
  saveMenuItem,
  saveVariant,
  setItemLocationAvailability,
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
    const item = await saveMenuItem(
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
    revalidatePath(adminPath(actor.restaurantSlug, "/menu"));
    revalidatePath(adminPath(actor.restaurantSlug, `/menu/items/${item.id}`));
    return item;
  });
}

export async function saveVariantAction(menuItemId: string, payload: unknown): Promise<ApiResult<null>> {
  return action(async () => {
    const actor = await requireRestaurantWidePermission("menu.manage");
    const input = variantSchema.parse(payload);
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    await saveVariant(actor.restaurantId, menuItemId, input, ctx);
    revalidatePath(adminPath(actor.restaurantSlug, `/menu/items/${menuItemId}`));
    revalidatePath(adminPath(actor.restaurantSlug, "/menu")); // the list's branch view shows it too
    return null;
  });
}

export async function deleteVariantAction(menuItemId: string, variantId: string): Promise<ApiResult<null>> {
  return action(async () => {
    const actor = await requireRestaurantWidePermission("menu.manage");
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    await removeVariant(variantId, ctx);
    revalidatePath(adminPath(actor.restaurantSlug, `/menu/items/${menuItemId}`));
    return null;
  });
}

export async function saveAddonGroupAction(menuItemId: string, payload: unknown): Promise<ApiResult<MenuAddonGroup | void>> {
  return action(async () => {
    const actor = await requireRestaurantWidePermission("menu.manage");
    const input = addonGroupSchema.parse(payload);
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    const group = await saveAddonGroup(actor.restaurantId, menuItemId, input, ctx);
    revalidatePath(adminPath(actor.restaurantSlug, `/menu/items/${menuItemId}`));
    return group;
  });
}

export async function deleteAddonGroupAction(menuItemId: string, groupId: string): Promise<ApiResult<null>> {
  return action(async () => {
    const actor = await requireRestaurantWidePermission("menu.manage");
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    await removeAddonGroup(groupId, ctx);
    revalidatePath(adminPath(actor.restaurantSlug, `/menu/items/${menuItemId}`));
    return null;
  });
}

export async function saveAddonAction(menuItemId: string, addonGroupId: string, payload: unknown): Promise<ApiResult<null>> {
  return action(async () => {
    const actor = await requireRestaurantWidePermission("menu.manage");
    const input = addonSchema.parse(payload);
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    await saveAddon(actor.restaurantId, addonGroupId, input, ctx);
    revalidatePath(adminPath(actor.restaurantSlug, `/menu/items/${menuItemId}`));
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
    revalidatePath(adminPath(actor.restaurantSlug, `/menu/items/${menuItemId}`));
    revalidatePath(adminPath(actor.restaurantSlug, "/menu"));
    return null;
  });
}

export async function deleteAddonAction(menuItemId: string, addonId: string): Promise<ApiResult<null>> {
  return action(async () => {
    const actor = await requireRestaurantWidePermission("menu.manage");
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    await removeAddon(addonId, ctx);
    revalidatePath(adminPath(actor.restaurantSlug, `/menu/items/${menuItemId}`));
    return null;
  });
}
