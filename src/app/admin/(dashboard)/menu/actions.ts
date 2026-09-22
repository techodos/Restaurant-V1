"use server";

import { revalidatePath } from "next/cache";
import type { ApiResult } from "@/shared/contract/api";
import type { MenuCategory, MenuItem } from "@/shared/contract/models";
import { action } from "@/server/errors";
import { categorySchema } from "@/server/validation/menu";
import { removeCategory, removeMenuItem, saveCategory, setItemAvailability } from "@/server/services/menu-admin";
import { requirePermission } from "@/web/session";

export async function saveCategoryAction(payload: unknown): Promise<ApiResult<MenuCategory>> {
  return action(async () => {
    const actor = await requirePermission("menu.manage");
    const input = categorySchema.parse(payload);
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    const category = await saveCategory(actor.restaurantId, input, ctx);
    revalidatePath("/admin/menu");
    return category;
  });
}

export async function deleteCategoryAction(categoryId: string): Promise<ApiResult<null>> {
  return action(async () => {
    const actor = await requirePermission("menu.manage");
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    await removeCategory(categoryId, ctx);
    revalidatePath("/admin/menu");
    return null;
  });
}

export async function deleteMenuItemAction(itemId: string): Promise<ApiResult<null>> {
  return action(async () => {
    const actor = await requirePermission("menu.manage");
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    await removeMenuItem(itemId, ctx);
    revalidatePath("/admin/menu");
    return null;
  });
}

export async function toggleItemAvailabilityAction(
  itemId: string,
  patch: { isAvailable?: boolean; isActive?: boolean; isFeatured?: boolean },
): Promise<ApiResult<MenuItem>> {
  return action(async () => {
    const actor = await requirePermission("menu.manage");
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    const item = await setItemAvailability(itemId, patch, ctx);
    revalidatePath("/admin/menu");
    return item;
  });
}
