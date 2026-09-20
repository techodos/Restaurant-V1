import type { DeliveryZone, Restaurant, RestaurantLocation } from "@/shared/contract/models";
import { errors } from "@/server/errors";
import { forRestaurant } from "@/server/context";
import { getRestaurantBySlug, listLocations } from "@/server/repositories/restaurants";
import { listDeliveryZones } from "@/server/repositories/deliveries";

/** Resolves a public slug to a restaurant or throws NOT_FOUND. */
export async function requireRestaurant(slug: string): Promise<Restaurant> {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) throw errors.notFound("Restaurant");
  return restaurant;
}

export function getLocations(restaurantId: string, options: { activeOnly?: boolean } = {}): Promise<RestaurantLocation[]> {
  return listLocations(restaurantId, forRestaurant(restaurantId), options);
}

export function getDeliveryZones(
  restaurantId: string,
  options: { locationId?: string; activeOnly?: boolean } = {},
): Promise<DeliveryZone[]> {
  return listDeliveryZones(restaurantId, forRestaurant(restaurantId), options);
}
