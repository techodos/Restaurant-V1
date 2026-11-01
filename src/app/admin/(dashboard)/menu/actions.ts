"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { adminPath } from "@/shared/utils";
import type { ApiResult } from "@/shared/contract/api";
import type { MenuCategory, MenuItem } from "@/shared/contract/models";
import { action } from "@/server/errors";
import { categorySchema } from "@/server/validation/menu";
import { releaseMenuImages, removeCategory, removeMenuItem, saveCategory, setItemAvailability } from "@/server/services/menu-admin";
import { requireRestaurantWidePermission } from "@/web/session";

export async function saveCategoryAction(payload: unknown): Promise<ApiResult<MenuCategory>> {
  return action(async () => {
    const actor = await requireRestaurantWidePermission("menu.manage");
    const input = categorySchema.parse(payload);
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    const category = await saveCategory(actor.restaurantId, input, ctx);
    revalidatePath(adminPath("/menu"));
    return category;
  });
}

export async function deleteCategoryAction(categoryId: string): Promise<ApiResult<null>> {
  return action(async () => {
    const actor = await requireRestaurantWidePermission("menu.manage");
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    const images = await removeCategory(categoryId, ctx);
    revalidatePath(adminPath("/menu"));
    // its dishes went with it (cascade): delete their uploaded photos once nothing else uses them
    if (images.length) after(() => releaseMenuImages(actor.restaurantId, images, ctx));
    return null;
  });
}

export async function deleteMenuItemAction(itemId: string): Promise<ApiResult<null>> {
  return action(async () => {
    const actor = await requireRestaurantWidePermission("menu.manage");
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    const image = await removeMenuItem(itemId, ctx);
    revalidatePath(adminPath("/menu"));
    if (image) after(() => releaseMenuImages(actor.restaurantId, [image], ctx));
    return null;
  });
}

export async function toggleItemAvailabilityAction(
  itemId: string,
  patch: { isAvailable?: boolean; isActive?: boolean; isFeatured?: boolean },
): Promise<ApiResult<MenuItem>> {
  return action(async () => {
    const actor = await requireRestaurantWidePermission("menu.manage");
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    const item = await setItemAvailability(itemId, patch, ctx);
    // no revalidatePath (see setItemLocationAvailabilityAction): ItemRowActions keeps the switch's state
    return item;
  });
}
