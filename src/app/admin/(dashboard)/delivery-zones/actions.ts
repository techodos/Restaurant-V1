"use server";

import { revalidatePath } from "next/cache";
import { adminPath } from "@/shared/utils";
import type { ApiResult } from "@/shared/contract/api";
import type { DeliveryZone, RestaurantLocation } from "@/shared/contract/models";
import { action } from "@/server/errors";
import { removeDeliveryZone, saveDeliveryZone, saveLocationDeliveryPricing } from "@/server/services/delivery-zones";
import { deliveryZoneSchema } from "@/server/validation/delivery-zones";
import { deliveryPricingSchema } from "@/shared/delivery-pricing";
import { requirePermission } from "@/web/session";

export async function saveDeliveryZoneAction(payload: unknown): Promise<ApiResult<DeliveryZone>> {
  return action(async () => {
    const actor = await requirePermission("delivery.manage");
    const input = deliveryZoneSchema.parse(payload);
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    const zone = await saveDeliveryZone(actor.restaurantId, input, ctx, actor);
    revalidatePath(adminPath("/delivery-zones"));
    return zone;
  });
}

/** `slabs: null` clears distance pricing for this branch (its zones go back to their own flat fee). */
export async function saveDeliveryPricingAction(locationId: string, slabs: unknown[] | null): Promise<ApiResult<RestaurantLocation>> {
  return action(async () => {
    const actor = await requirePermission("delivery.manage");
    const pricing = slabs === null ? null : deliveryPricingSchema.parse({ slabs });
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    const location = await saveLocationDeliveryPricing(actor.restaurantId, locationId, pricing, ctx, actor);
    revalidatePath(adminPath("/delivery-zones"));
    return location;
  });
}

export async function deleteDeliveryZoneAction(zoneId: string): Promise<ApiResult<null>> {
  return action(async () => {
    const actor = await requirePermission("delivery.manage");
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    await removeDeliveryZone(actor.restaurantId, zoneId, ctx, actor);
    revalidatePath(adminPath("/delivery-zones"));
    return null;
  });
}
