/**
 * Everything the data layer needs to know about who is acting and on which
 * restaurant. Built once per request by the delivery layer (server actions,
 * route handlers, tests) and passed down through services to repositories.
 *
 * `restaurantId` does two jobs:
 *  • it is the tenant pin applied to the database session, and
 *  • it is the routing key the database registry uses to pick the database that
 *    holds this restaurant (see `db/registry.ts`).
 */
export interface RequestContext {
  /** authenticated user id (team member or customer) */
  userId?: string | null;
  /** restaurant the request operates on */
  restaurantId?: string | null;
  /** authenticated storefront customer id */
  customerId?: string | null;
  /** opaque guest cart token */
  cartToken?: string | null;
  /** human readable actor name stored on audit rows */
  actor?: string | null;
}

/** Anonymous visitor with no tenant pin (public reads, platform lookups). */
export const EMPTY_CONTEXT: RequestContext = {};

/** Same request, pinned to a restaurant. */
export function forRestaurant(restaurantId: string, context: RequestContext = EMPTY_CONTEXT): RequestContext {
  return { ...context, restaurantId };
}
