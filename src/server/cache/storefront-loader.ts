import { loadStorefrontData } from "@/server/repositories/storefront";
import { buildStorefrontSnapshot } from "./storefront-snapshot";
import type { StorefrontSnapshot } from "./types";

/**
 * Reads the restaurant's public storefront data through the repository layer
 * and builds a snapshot from it. Knows nothing about connections, pools or SQL.
 */
export async function loadStorefrontSnapshot(restaurantSlug: string): Promise<StorefrontSnapshot> {
  const startedAt = Date.now();
  const data = await loadStorefrontData(restaurantSlug);
  if (!data) {
    // A misconfigured instance, not a transient failure: fail startup with a fix.
    throw new Error(`Restaurant "${restaurantSlug}" was not found. Set NEXT_PUBLIC_DEFAULT_RESTAURANT to this instance's restaurant slug.`);
  }
  return buildStorefrontSnapshot(data, { loadedAt: new Date(), loadDurationMs: Date.now() - startedAt });
}
