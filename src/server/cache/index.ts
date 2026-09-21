import { config } from "@/server/config";
import { errors } from "@/server/errors";
import { logger } from "@/server/logger";
import { loadStorefrontSnapshot } from "./storefront-loader";
import { StorefrontCache } from "./storefront-cache";
import type { StorefrontSnapshot } from "./types";

export { StorefrontCache } from "./storefront-cache";
export type { MenuSearchFilters, StorefrontSnapshot } from "./types";
export * from "./storefront-queries";

/**
 * The one storefront cache of this process (one instance → one restaurant → one
 * database → one snapshot).
 *
 * Kept on `globalThis` for the same reason the database manager is: Next.js
 * bundles `instrumentation.ts` and the route handlers separately, and dev-mode
 * hot reloads re-evaluate modules. A module-level variable would give the
 * startup hook and the pages different caches (and different refresh timers).
 */
const globalForCache = globalThis as typeof globalThis & { __storefrontCache?: StorefrontCache };

export function getStorefrontCache(): StorefrontCache {
  globalForCache.__storefrontCache ??= new StorefrontCache({
    load: () => loadStorefrontSnapshot(config.app.defaultRestaurantSlug),
    refreshIntervalMs: config.storefrontCache.refreshIntervalMs,
    loadTimeoutMs: config.storefrontCache.startupTimeoutMs,
  });
  return globalForCache.__storefrontCache;
}

/**
 * Startup hook body: loads the first snapshot and starts the refresh timer.
 * Rejects when the first load fails, which must fail application startup —
 * serving requests from an empty cache by falling back to the database per
 * request is exactly what the cache exists to prevent. Idempotent.
 */
export async function startStorefrontCache(): Promise<void> {
  if (!config.storefrontCache.enabled) {
    logger.info("cache", "storefront cache disabled (STOREFRONT_CACHE_ENABLED=false); storefront reads use the database");
    return;
  }
  await getStorefrontCache().start();
}

/**
 * What storefront services call. `null` means the cache is switched off and the
 * caller must use its database path. When the cache is on but has no snapshot
 * (startup failed or has not run) this throws instead of quietly hitting the
 * database on every request.
 */
export function currentSnapshot(): StorefrontSnapshot | null {
  if (!config.storefrontCache.enabled) return null;
  const snapshot = getStorefrontCache().get();
  if (!snapshot) {
    logger.error("cache", "storefront cache read before the first snapshot was loaded");
    throw errors.internal();
  }
  return snapshot;
}

/** The snapshot for `restaurantId`, `null` when the cache is off. This instance serves one restaurant only. */
export function snapshotForRestaurant(restaurantId: string): StorefrontSnapshot | null {
  const snapshot = currentSnapshot();
  if (snapshot && snapshot.context.restaurant.id !== restaurantId) throw errors.notFound("Restaurant");
  return snapshot;
}

/** The snapshot for a public slug, `null` when the cache is off. Other slugs do not exist on this instance. */
export function snapshotForSlug(slug: string): StorefrontSnapshot | null {
  const snapshot = currentSnapshot();
  if (snapshot && snapshot.context.restaurant.slug !== slug) throw errors.notFound("Restaurant");
  return snapshot;
}
