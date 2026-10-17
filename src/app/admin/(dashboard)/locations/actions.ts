"use server";

import { revalidatePath } from "next/cache";
import { adminPath } from "@/shared/utils";
import type { ApiResult } from "@/shared/contract/api";
import type { RestaurantLocation } from "@/shared/contract/models";
import { action } from "@/server/errors";
import { removeLocation, saveLocation } from "@/server/services/restaurants";
import { locationSchema } from "@/server/validation/locations";
import { requirePermission } from "@/web/session";

export async function saveLocationAction(payload: unknown): Promise<ApiResult<RestaurantLocation>> {
  return action(async () => {
    const actor = await requirePermission("locations.manage");
    const input = locationSchema.parse(payload);
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    const location = await saveLocation(actor.restaurantId, input, ctx);
    revalidatePath(adminPath(actor.restaurantSlug, "/locations"));
    return location;
  });
}

export async function deleteLocationAction(locationId: string): Promise<ApiResult<null>> {
  return action(async () => {
    const actor = await requirePermission("locations.manage");
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    await removeLocation(locationId, ctx);
    revalidatePath(adminPath(actor.restaurantSlug, "/locations"));
    return null;
  });
}
