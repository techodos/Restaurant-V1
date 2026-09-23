import type { DeliveryZone, Restaurant, RestaurantLocation } from "@/shared/contract/models";
import type { RestaurantFeatures, RestaurantSettings, RestaurantTheme } from "@/shared/contract/settings";
import { restaurantFeaturesSchema, restaurantSettingsSchema } from "@/shared/contract/settings";
import { getStorefrontCache, readDeliveryZones, readLocations, snapshotForRestaurant } from "@/server/cache";
import { errors } from "@/server/errors";
import { resolveTheme } from "@/server/domain/storefront-context";
import { forRestaurant, type RequestContext } from "@/server/context";
import {
  createLocation,
  deleteLocation,
  getRestaurantById,
  getRestaurantBySlug,
  listLocations,
  updateLocation,
  updateRestaurant,
  type LocationInput,
} from "@/server/repositories/restaurants";
import { getWebsite } from "@/server/repositories/websites";
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

/**
 * The restaurant's brand theme for the admin UI — same resolution the storefront
 * uses (website.theme JSONB, falling back to restaurants.primary_color), but
 * without the "is this restaurant publicly visible" gate storefront reads apply,
 * since staff must be able to sign in and see their branding before going live.
 */
export async function getAdminTheme(restaurant: Restaurant): Promise<RestaurantTheme> {
  const website = await getWebsite(restaurant.id, forRestaurant(restaurant.id));
  return resolveTheme(website?.theme ?? {}, restaurant.primaryColor);
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

/** Staff-facing location CRUD (admin). Locations are in the storefront snapshot — invalidate on every write. */
export async function saveLocation(
  restaurantId: string,
  input: LocationInput & { id?: string },
  ctx: RequestContext,
): Promise<RestaurantLocation> {
  const { id, ...patch } = input;
  const location = id ? await updateLocation(id, patch, ctx) : await createLocation(restaurantId, input, ctx);
  getStorefrontCache().invalidate();
  return location;
}

export async function removeLocation(locationId: string, ctx: RequestContext): Promise<void> {
  await deleteLocation(locationId, ctx);
  getStorefrontCache().invalidate();
}

async function requireCurrentRestaurant(restaurantId: string, ctx: RequestContext): Promise<Restaurant> {
  const restaurant = await getRestaurantById(restaurantId, ctx);
  if (!restaurant) throw errors.notFound("Restaurant");
  return restaurant;
}

/**
 * restaurants.features is a whole JSONB column (repositories/restaurants.ts#updateRestaurant
 * replaces it, it does not merge per key), so every save reads the current value first and
 * merges the patch into it before writing the full object back.
 */
export async function updateRestaurantFeatures(
  restaurantId: string,
  patch: Partial<RestaurantFeatures>,
  ctx: RequestContext,
): Promise<Restaurant> {
  const current = await requireCurrentRestaurant(restaurantId, ctx);
  const merged = restaurantFeaturesSchema.parse({ ...current.features, ...patch });
  const restaurant = await updateRestaurant(restaurantId, { features: merged }, ctx);
  getStorefrontCache().invalidate();
  return restaurant;
}

/** Same whole-column-JSONB caveat as above, scoped to one settings section (tax, ordering, ...). */
export async function updateRestaurantSettingsSection<K extends keyof RestaurantSettings>(
  restaurantId: string,
  section: K,
  patch: Partial<RestaurantSettings[K]>,
  ctx: RequestContext,
): Promise<Restaurant> {
  const current = await requireCurrentRestaurant(restaurantId, ctx);
  const mergedSettings = { ...current.settings, [section]: { ...current.settings[section], ...patch } };
  const merged = restaurantSettingsSchema.parse(mergedSettings);
  const restaurant = await updateRestaurant(restaurantId, { settings: merged }, ctx);
  getStorefrontCache().invalidate();
  return restaurant;
}
