import type { BranchOption, BranchingState, DeliveryDestination } from "@/shared/branching";
import type { DeliveryZone, RestaurantLocation } from "@/shared/contract/models";
import { haversineKm } from "@/shared/geo";
import { matchDeliveryZone } from "@/server/repositories/deliveries";
import { getBranchUnavailableItems } from "./catalog";
import { getDeliveryZones, getLocations } from "./restaurants";

/**
 * Multi-branch ordering (`features.BranchingFeature`): which branches can serve a delivery destination.
 *
 * One rule, and it is the order's own: a branch serves a destination when it is in the destination's
 * CITY and one of ITS active delivery zones matches the address (`servingZones`, area / postal code) — exactly what
 * `createOrder` checks before it writes a delivery order for that branch, so a branch offered here can
 * never be refused at checkout for coverage. There is no second coverage system (no radius, no polygon).
 *
 * The destination decides, never the customer's own position: someone standing in Karachi who enters
 * a Lahore address gets the Lahore branches. Distance is straight-line from the DESTINATION to the
 * branch and only orders the list; it never excludes a branch whose zone matches.
 *
 * Everything is read from the storefront snapshot (locations, zones, per-branch "off" items): no
 * database on a page view.
 */

function toOption(location: RestaurantLocation, destination: DeliveryDestination | null): BranchOption {
  const known =
    destination?.latitude != null && destination.longitude != null && location.latitude !== null && location.longitude !== null;
  return {
    id: location.id,
    name: location.name,
    address: [location.addressLine1, location.area].filter(Boolean).join(", "),
    city: location.city ?? null,
    distanceKm: known
      ? haversineKm(
          { latitude: destination!.latitude!, longitude: destination!.longitude! },
          { latitude: location.latitude!, longitude: location.longitude! },
        )
      : null,
  };
}

/** Nearest first; branches without a distance keep their display order, after the measured ones. */
function byDistance(a: BranchOption, b: BranchOption): number {
  if (a.distanceKm === null && b.distanceKm === null) return 0;
  if (a.distanceKm === null) return 1;
  if (b.distanceKm === null) return -1;
  return a.distanceKm - b.distanceKm;
}

/** Pure: the ranking itself, so it can be tested without a snapshot. */
export function rankBranches(
  locations: readonly RestaurantLocation[],
  zones: readonly DeliveryZone[],
  destination: DeliveryDestination | null,
): Pick<BranchingState, "delivery" | "all" | "deliveryCities"> {
  const active = locations.filter((location) => location.isActive);
  const all = active.map((location) => toOption(location, destination)).sort(byDistance);
  // from the data, never a list in code: a new city appears here as soon as a branch there has a zone
  const deliveryCities = [
    ...new Map(
      active
        .filter((location) => location.city?.trim() && zones.some((zone) => zone.isActive && zone.locationId === location.id))
        .map((location) => [location.city!.trim().toLowerCase(), location.city!.trim()]),
    ).values(),
  ];
  if (!destination) return { delivery: [], all, deliveryCities };

  // filter FIRST (city, then the branch's own zones), only then is the list ordered by distance: a branch
  // in another city never serves, however close its coordinates — and there is no "first branch" fallback
  // the destination's pin (map / search / current location / saved address) decides map zones; a typed
  // area without a pin falls back to area names — exactly what createOrder will check for this address
  const address = {
    area: destination.area,
    city: destination.city,
    postalCode: destination.postalCode,
    latitude: destination.latitude,
    longitude: destination.longitude,
  };
  const branchOf = (locationId: string) => active.find((location) => location.id === locationId);
  const serves = new Set(
    active
      .filter((location) => matchDeliveryZone(zones.filter((zone) => zone.locationId === location.id), address, branchOf) !== null)
      .map((location) => location.id),
  );
  return { delivery: all.filter((branch) => serves.has(branch.id)), all, deliveryCities };
}

export async function resolveBranching(restaurantId: string, destination: DeliveryDestination | null): Promise<BranchingState> {
  const [locations, zones, unavailable] = await Promise.all([
    getLocations(restaurantId, { activeOnly: true }),
    getDeliveryZones(restaurantId, { activeOnly: true }),
    getBranchUnavailableItems(restaurantId),
  ]);
  return {
    destination,
    ...rankBranches(locations, zones, destination),
    unavailable: Object.fromEntries(Object.entries(unavailable).map(([locationId, ids]) => [locationId, [...ids]])),
  };
}
