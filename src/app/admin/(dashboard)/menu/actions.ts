"use server";

import { revalidatePath } from "next/cache";
import { adminPath } from "@/shared/utils";
import type { ApiResult } from "@/shared/contract/api";
import type { MenuCategory, MenuItem } from "@/shared/contract/models";
import { action } from "@/server/errors";
import { categorySchema } from "@/server/validation/menu";
import { removeCategory, removeMenuItem, saveCategory, setItemAvailability } from "@/server/services/menu-admin";
import { requireRestaurantWidePermission } from "@/web/session";

export async function saveCategoryAction(payload: unknown): Promise<ApiResult<MenuCategory>> {
  return action(async () => {
    const actor = await requireRestaurantWidePermission("menu.manage");
    const input = categorySchema.parse(payload);
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    const category = await saveCategory(actor.restaurantId, input, ctx);
    revalidatePath(adminPath(actor.restaurantSlug, "/menu"));
    return category;
  });
}

export async function deleteCategoryAction(categoryId: string): Promise<ApiResult<null>> {
  return action(async () => {
    const actor = await requireRestaurantWidePermission("menu.manage");
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    await removeCategory(categoryId, ctx);
    revalidatePath(adminPath(actor.restaurantSlug, "/menu"));
    return null;
  });
}

export async function deleteMenuItemAction(itemId: string): Promise<ApiResult<null>> {
  return action(async () => {
    const actor = await requireRestaurantWidePermission("menu.manage");
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    await removeMenuItem(itemId, ctx);
    revalidatePath(adminPath(actor.restaurantSlug, "/menu"));
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
