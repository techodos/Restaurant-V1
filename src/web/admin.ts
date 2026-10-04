import { cache } from "react";
import type { Restaurant } from "@/shared/contract/models";
import type { RestaurantTheme } from "@/shared/contract/settings";
import { getAdminRestaurantContext } from "@/server/services/restaurants";

/**
 * The restaurant whose admin is open (/r/<restaurantSlug>/admin) and its brand theme: ONE database
 * statement for both, shared by the admin layouts and every admin page of a request (React `cache`),
 * and kept for 30 s per process across requests (`getAdminRestaurantContext`; restaurant writes clear
 * it). Read from the database, not the storefront snapshot, so a restaurant's staff can reach their
 * admin on any instance and before the site is public. Display only — writes read the row themselves.
 */
const getAdminContext = cache((restaurantSlug: string) => getAdminRestaurantContext(restaurantSlug));

export const getAdminRestaurant = cache(async (restaurantSlug: string): Promise<Restaurant> => {
  return (await getAdminContext(restaurantSlug)).restaurant;
});

/** The restaurant's brand theme (website.theme, falling back to restaurants.primary_color). */
export const getAdminTheme = cache(async (restaurantSlug: string): Promise<RestaurantTheme> => {
  return (await getAdminContext(restaurantSlug)).theme;
});

/**
 * The restaurant read fresh from the database, for a page whose forms save what it shows (settings):
 * a value up to 30 s old from another instance must never be put in front of the customer to re-save.
 */
export const getAdminRestaurantFresh = cache(async (restaurantSlug: string): Promise<Restaurant> => {
  return (await getAdminRestaurantContext(restaurantSlug, { fresh: true })).restaurant;
});
