import { cache } from "react";
import { cookies } from "next/headers";
import type { Restaurant } from "@/shared/contract/models";
import type { RestaurantTheme } from "@/shared/contract/settings";
import { getAdminRestaurantContext, getLocations } from "@/server/services/restaurants";
import { config } from "@/server/config";
import { ALL_BRANCHES, resolveBranchScope, type BranchScope } from "@/server/auth/branch-scope";
import { errors } from "@/server/errors";
import { adminPath } from "@/shared/utils";
import { ADMIN_BRANCH_COOKIE, cookieOptions } from "./cookies";
import { requireStaff } from "./session";

/**
 * The branch this admin request shows (see server/auth/branch-scope.ts). A branch-scoped member always
 * gets their own branch; owner/admin get their choice from the header's branch selector (a cookie),
 * defaulting to the primary branch. Every branch-scoped admin page and route reads THIS, never a
 * `?location=` from the URL.
 */
export const getAdminBranchScope = cache(async (restaurantSlug: string): Promise<BranchScope> => {
  const actor = await requireStaff(restaurantSlug);
  const [locations, store] = await Promise.all([getLocations(actor.restaurantId, { activeOnly: true }), cookies()]);
  return resolveBranchScope(actor, locations, store.get(ADMIN_BRANCH_COOKIE)?.value);
});

/**
 * Stores a restaurant-wide member's branch choice. Refused for branch-scoped staff, and only an active
 * branch of THIS restaurant (or "all") is accepted. Server Actions only.
 */
export async function selectAdminBranch(restaurantSlug: string, value: string): Promise<void> {
  const actor = await requireStaff(restaurantSlug);
  if (actor.member.locationId !== null) throw errors.forbidden("Your account is tied to one branch.");
  if (value !== ALL_BRANCHES) {
    const locations = await getLocations(actor.restaurantId, { activeOnly: true });
    if (!locations.some((location) => location.id === value)) throw errors.notFound("Branch");
  }
  (await cookies()).set(ADMIN_BRANCH_COOKIE, value, { ...(await cookieOptions(60 * 60 * 24 * 180)), path: adminPath(actor.restaurantSlug) });
}

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

/** Google Maps for the admin's map pickers (branch pin, delivery area); null when no key is configured. */
export function getAdminMaps(restaurant: Pick<Restaurant, "country">): { apiKey: string; country: string } | null {
  const apiKey = config.maps?.apiKey;
  return apiKey ? { apiKey, country: restaurant.country || "PK" } : null;
}
