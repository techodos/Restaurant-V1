import type { RequestContext } from "@/server/context";
import { errors } from "@/server/errors";
import { assertBranchAccess, type ScopedActor } from "@/server/auth/branch-scope";
import { getStorefrontCache } from "@/server/cache";
import type { DeliveryZone } from "@/shared/contract/models";
import { listLocations } from "@/server/repositories/restaurants";
import {
  createDeliveryZone,
  deleteDeliveryZone,
  getDeliveryZone,
  listDeliveryZones,
  updateDeliveryZone,
  type DeliveryZoneInput,
} from "@/server/repositories/deliveries";

function normalize(value: string | undefined): string | null {
  return value && value.trim() ? value.trim() : null;
}

/**
 * Staff-facing delivery zone CRUD (admin). Zones are in the storefront snapshot — invalidate on every write.
 * Every zone belongs to one branch: branch staff see and change only their own branch's zones (the id and
 * branch in the request are never trusted — the stored zone's branch is checked; 0029 is the backstop).
 */
export function listDeliveryZonesForAdmin(restaurantId: string, ctx: RequestContext, locationId: string | null = null): Promise<DeliveryZone[]> {
  return listDeliveryZones(restaurantId, ctx, locationId ? { locationId } : {});
}

async function requireZoneInScope(restaurantId: string, zoneId: string, actor: ScopedActor, ctx: RequestContext): Promise<DeliveryZone> {
  const zone = await getDeliveryZone(zoneId, ctx);
  if (!zone || zone.restaurantId !== restaurantId) throw errors.notFound("Delivery zone");
  assertBranchAccess(actor, zone.locationId);
  return zone;
}

export type ZoneCoverage = "areas" | "radius" | "polygon";

export async function saveDeliveryZone(
  restaurantId: string,
  input: Omit<DeliveryZoneInput, "radiusKm" | "polygon"> & { id?: string; coverage?: ZoneCoverage; radiusKm?: number; polygon?: [number, number][] },
  ctx: RequestContext,
  actor: ScopedActor,
): Promise<DeliveryZone> {
  const existing = input.id ? await requireZoneInScope(restaurantId, input.id, actor, ctx) : null;
  if (!existing) assertBranchAccess(actor, input.locationId);
  const branchId = existing?.locationId ?? input.locationId; // a zone never moves to another branch

  // One coverage mode per zone (the database enforces it too, 0030). Choosing a mode clears the other
  // geometry; "areas" clears both. A radius is measured from the branch, so the branch needs a pin.
  const coverage = input.coverage ?? "areas";
  if (coverage === "radius") {
    const branch = (await listLocations(restaurantId, ctx)).find((location) => location.id === branchId);
    if (!branch) throw errors.notFound("Branch");
    if (branch.latitude === null || branch.longitude === null) {
      throw errors.validation("Set this branch's location on the map first (Locations), then use a delivery radius.", {
        radiusKm: "The branch has no map location yet.",
      });
    }
  }
  const { coverage: _coverage, radiusKm, polygon, ...fields } = input;
  const patch: DeliveryZoneInput = {
    ...fields,
    minOrderAmount: normalize(input.minOrderAmount ?? undefined) ?? undefined,
    freeDeliveryOver: normalize(input.freeDeliveryOver ?? undefined),
    radiusKm: coverage === "radius" ? (radiusKm ?? null) : null,
    polygon: coverage === "polygon" ? (polygon ?? null) : null,
  };
  const zone = input.id ? await updateDeliveryZone(input.id, patch, ctx) : await createDeliveryZone(restaurantId, patch, ctx);
  getStorefrontCache().invalidate();
  return zone;
}

export async function removeDeliveryZone(restaurantId: string, zoneId: string, ctx: RequestContext, actor: ScopedActor): Promise<void> {
  await requireZoneInScope(restaurantId, zoneId, actor, ctx);
  await deleteDeliveryZone(zoneId, ctx);
  getStorefrontCache().invalidate();
}
