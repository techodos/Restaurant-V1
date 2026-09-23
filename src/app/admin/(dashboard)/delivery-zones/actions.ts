"use server";

import { revalidatePath } from "next/cache";
import type { ApiResult } from "@/shared/contract/api";
import type { DeliveryZone } from "@/shared/contract/models";
import { action } from "@/server/errors";
import { removeDeliveryZone, saveDeliveryZone } from "@/server/services/delivery-zones";
import { deliveryZoneSchema } from "@/server/validation/delivery-zones";
import { requirePermission } from "@/web/session";

export async function saveDeliveryZoneAction(payload: unknown): Promise<ApiResult<DeliveryZone>> {
  return action(async () => {
    const actor = await requirePermission("delivery.manage");
    const input = deliveryZoneSchema.parse(payload);
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    const zone = await saveDeliveryZone(actor.restaurantId, input, ctx);
    revalidatePath("/admin/delivery-zones");
    return zone;
  });
}

export async function deleteDeliveryZoneAction(zoneId: string): Promise<ApiResult<null>> {
  return action(async () => {
    const actor = await requirePermission("delivery.manage");
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    await removeDeliveryZone(zoneId, ctx);
    revalidatePath("/admin/delivery-zones");
    return null;
  });
}
