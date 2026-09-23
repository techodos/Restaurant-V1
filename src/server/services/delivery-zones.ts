import type { RequestContext } from "@/server/context";
import { getStorefrontCache } from "@/server/cache";
import type { DeliveryZone } from "@/shared/contract/models";
import {
  createDeliveryZone,
  deleteDeliveryZone,
  listDeliveryZones,
  updateDeliveryZone,
  type DeliveryZoneInput,
} from "@/server/repositories/deliveries";

function normalize(value: string | undefined): string | null {
  return value && value.trim() ? value.trim() : null;
}

/** Staff-facing delivery zone CRUD (admin). Zones are in the storefront snapshot — invalidate on every write. */
export function listDeliveryZonesForAdmin(restaurantId: string, ctx: RequestContext): Promise<DeliveryZone[]> {
  return listDeliveryZones(restaurantId, ctx);
}

export async function saveDeliveryZone(
  restaurantId: string,
  input: DeliveryZoneInput & { id?: string },
  ctx: RequestContext,
): Promise<DeliveryZone> {
  const patch: DeliveryZoneInput = {
    ...input,
    minOrderAmount: normalize(input.minOrderAmount ?? undefined) ?? undefined,
    freeDeliveryOver: normalize(input.freeDeliveryOver ?? undefined),
  };
  const zone = input.id ? await updateDeliveryZone(input.id, patch, ctx) : await createDeliveryZone(restaurantId, patch, ctx);
  getStorefrontCache().invalidate();
  return zone;
}

export async function removeDeliveryZone(zoneId: string, ctx: RequestContext): Promise<void> {
  await deleteDeliveryZone(zoneId, ctx);
  getStorefrontCache().invalidate();
}
