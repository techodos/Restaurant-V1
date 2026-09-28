import { cache } from "react";
import type { Restaurant } from "@/shared/contract/models";
import type { RestaurantTheme } from "@/shared/contract/settings";
import { getAdminTheme as getAdminThemeForRestaurant, requireRestaurant } from "@/server/services/restaurants";

/**
 * The restaurant whose admin is open (/r/<restaurantSlug>/admin), cached per request so the admin layout and every
 * admin page share one lookup instead of one each. Read from the database, not the storefront snapshot, so a
 * restaurant's staff can reach their admin on any instance and before the site is public.
 */
export const getAdminRestaurant = cache((restaurantSlug: string): Promise<Restaurant> => requireRestaurant(restaurantSlug));

/** The restaurant's brand theme (website.theme, falling back to restaurants.primary_color), cached per request. */
export const getAdminTheme = cache(async (restaurantSlug: string): Promise<RestaurantTheme> => {
  const restaurant = await getAdminRestaurant(restaurantSlug);
  return getAdminThemeForRestaurant(restaurant);
});
