import { Database, type RequestContext } from "../../src/lib/db/pool";

/** Shared connection to the disposable test database. */
export const testDatabase = new Database(
  process.env.DATABASE_URL ?? "postgresql://app_runtime:app_runtime@localhost:5432/restaurant_platform_test",
  process.env.DATABASE_URL_SERVICE ?? "postgresql://app_service:app_service@localhost:5432/restaurant_platform_test",
);

export const BELLA = {
  restaurantId: "11111111-1111-4111-8111-111111111111",
  locationGulberg: "11111111-1111-4111-8111-111111110001",
  locationDha: "11111111-1111-4111-8111-111111110002",
  zoneGulberg: "55555555-5555-4555-8555-555555550001",
  categoryPizza: "44444444-4444-4444-8444-444444440002",
  userOwner: "22222222-2222-4222-8222-222222220001",
  userChef: "22222222-2222-4222-8222-222222220004",
  memberOwner: "33333333-3333-4333-8333-333333330001",
} as const;

export const SAKURA = {
  restaurantId: "99999999-9999-4999-8999-999999990001",
  userOwner: "99999999-9999-4999-8999-999999990004",
} as const;

/** Context for an unauthenticated storefront visitor. */
export const ANON: RequestContext = {};

/** Context for the Bella Napoli owner. */
export const OWNER: RequestContext = {
  userId: BELLA.userOwner,
  restaurantId: BELLA.restaurantId,
  actor: "Imran Chaudhry",
};

/** Context for a kitchen staff member (limited permissions). */
export const CHEF: RequestContext = {
  userId: BELLA.userChef,
  restaurantId: BELLA.restaurantId,
  actor: "Shahid Mehmood",
};

/** Context for the competing restaurant's owner. */
export const SAKURA_OWNER: RequestContext = {
  userId: SAKURA.userOwner,
  restaurantId: SAKURA.restaurantId,
  actor: "Hina Sato",
};

export function cartContext(token: string, extra: Partial<RequestContext> = {}): RequestContext {
  return { cartToken: token, ...extra };
}

export function newCartToken(): string {
  return `test-${Math.random().toString(36).slice(2)}-${Date.now()}`;
}
