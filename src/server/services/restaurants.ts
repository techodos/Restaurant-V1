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
  getRestaurantWithThemeBySlug,
  listLocations,
  updateLocation,
  updateRestaurant,
  type LocationInput,
} from "@/server/repositories/restaurants";
import { listDeliveryZones } from "@/server/repositories/deliveries";
import { ttlCache } from "@/server/cache/ttl";

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

export interface AdminRestaurantContext {
  restaurant: Restaurant;
  theme: RestaurantTheme;
}

const ADMIN_RESTAURANT_TTL_MS = 30_000;
const adminRestaurants = ttlCache<AdminRestaurantContext>("admin-restaurants", ADMIN_RESTAURANT_TTL_MS);

/** Drops the cached admin restaurant/theme — every write to a restaurant row calls this. */
export function invalidateAdminRestaurants(): void {
  adminRestaurants.clear();
}

/**
 * The restaurant and its brand theme for the admin shell, which needs both on every page, route and
 * re-render. The theme is the storefront's own resolution (website.theme JSONB, falling back to
 * restaurants.primary_color) minus the "is this restaurant publicly visible" gate, since staff must
 * see their branding before going live: ONE statement (`getRestaurantWithThemeBySlug`), cached per process for
 * `ADMIN_RESTAURANT_TTL_MS` unless `fresh`. Display only — anything that WRITES a restaurant reads the
 * current row itself (`updateRestaurantFeatures`/`updateRestaurantSettingsSection` →
 * `requireCurrentRestaurant`), and those writes clear this cache. The settings page passes `fresh`,
 * since what it shows is what its forms save. Throws NOT_FOUND like `requireRestaurant`.
 */
export async function getAdminRestaurantContext(slug: string, options: { fresh?: boolean } = {}): Promise<AdminRestaurantContext> {
  const load = async (): Promise<AdminRestaurantContext> => {
    const found = await getRestaurantWithThemeBySlug(slug);
    if (!found) throw errors.notFound("Restaurant");
    const theme = resolveTheme(found.websiteTheme, found.restaurant.primaryColor);
    return { restaurant: found.restaurant, theme };
  };
  if (!options.fresh) return adminRestaurants.get(slug, load);
  const context = await load();
  adminRestaurants.set(slug, context);
  return context;
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
  invalidateAdminRestaurants();
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
  invalidateAdminRestaurants();
  return restaurant;
}
