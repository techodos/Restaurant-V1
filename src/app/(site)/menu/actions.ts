"use server";

import type { ApiResult } from "@/shared/contract/api";
import { normaliseDestination, type BranchingState } from "@/shared/branching";
import { action, errors } from "@/server/errors";
import { checkRateLimit } from "@/server/rate-limit";
import { resolveBranching } from "@/server/services/branching";
import { destinationSchema } from "@/server/validation/branching";
import { callerIdentifier } from "@/web/session";
import { requireStorefrontRestaurant, writeDestination } from "@/web/storefront";

/**
 * Multi-branch ordering: remembers where the customer wants delivery (its own cookie) and answers with
 * the branches that serve it, nearest first — from the storefront snapshot, no database. The browser
 * then puts the branch it picks into the tray cookie, as checkout's branch step always did.
 * A no-op error for a restaurant that has not switched `BranchingFeature` on.
 */
export async function setDestinationAction(slug: string, payload: unknown): Promise<ApiResult<BranchingState>> {
  return action(async () => {
    const input = destinationSchema.parse(payload);
    const restaurant = await requireStorefrontRestaurant(slug);
    if (!restaurant.features.BranchingFeature) throw errors.validation("Branch selection is not available here.");
    checkRateLimit({ key: "destination", identifier: await callerIdentifier(), limit: 40, windowMs: 5 * 60_000 });

    const destination = normaliseDestination(input);
    if (!destination) throw errors.validation("Tell us the area or city to deliver to.");
    await writeDestination(restaurant.slug, destination);
    return resolveBranching(restaurant.id, destination);
  });
}
