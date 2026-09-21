import type { DeliveryZone, Restaurant, RestaurantLocation } from "@/shared/contract/models";
import { readDeliveryZones, readLocations, snapshotForRestaurant } from "@/server/cache";
import { errors } from "@/server/errors";
import { forRestaurant } from "@/server/context";
import { getRestaurantBySlug, listLocations } from "@/server/repositories/restaurants";
import { listDeliveryZones } from "@/server/repositories/deliveries";

/**
 * Resolves a public slug to a restaurant or throws NOT_FOUND. Always reads the
 * database: it gates writes (cart, checkout, reservations, reviews), which must
 * see feature flags and status as they are now, not as of the last snapshot.
 */
export async function requireRestaurant(slug: string): Promise<Restaurant> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) throw errors.notFound("Restaurant");
  return restaurant;
}

/** Locations for display; served from the storefront snapshot. */
export async function getLocations(restaurantId: string, options: { activeOnly?: boolean } = {}): Promise<RestaurantLocation[]> {
  const snapshot = snapshotForRestaurant(restaurantId);
  if (snapshot) return readLocations(snapshot, options);
  return listLocations(restaurantId, forRestaurant(restaurantId), options);
}

/** Delivery zones for display (coverage lists); served from the storefront snapshot. */
export async function getDeliveryZones(
  restaurantId: string,
  options: { locationId?: string; activeOnly?: boolean } = {},
): Promise<DeliveryZone[]> {
  const snapshot = snapshotForRestaurant(restaurantId);
  if (snapshot) return readDeliveryZones(snapshot, options);
  return listDeliveryZones(restaurantId, forRestaurant(restaurantId), options);
}

/**
 * Delivery zones as pricing and checkout must see them: always read from the
 * database, never the snapshot, because fees and minimum order amounts decide
 * what a customer is charged.
 */
export function getLiveDeliveryZones(
  restaurantId: string,
  options: { locationId?: string; activeOnly?: boolean } = {},
): Promise<DeliveryZone[]> {
  return listDeliveryZones(restaurantId, forRestaurant(restaurantId), options);
}
