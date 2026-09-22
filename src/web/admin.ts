import { cache } from "react";
import { config } from "@/server/config";
import type { Restaurant } from "@/shared/contract/models";
import type { RestaurantTheme } from "@/shared/contract/settings";
import { getAdminTheme as getAdminThemeForRestaurant, requireRestaurant } from "@/server/services/restaurants";

/**
 * The single restaurant this instance serves (SKILL.md §15 / DECISIONS.md §19:
 * one instance → one restaurant), cached per request so the admin layout and
 * every admin page share one lookup instead of one each.
 */
export const getAdminRestaurant = cache((): Promise<Restaurant> => requireRestaurant(config.app.defaultRestaurantSlug));

/** The restaurant's brand theme (website.theme, falling back to restaurants.primary_color), cached per request. */
export const getAdminTheme = cache(async (): Promise<RestaurantTheme> => {
  const restaurant = await getAdminRestaurant();
  return getAdminThemeForRestaurant(restaurant);
});
