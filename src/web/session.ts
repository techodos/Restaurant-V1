import { cache } from "react";
import { cookies } from "next/headers";
import { errors } from "@/server/errors";
import type { Permission } from "@/server/auth/permissions";
import {
  assertPermission,
  authenticateStaff,
  resolveCustomer,
  type StaffActor,
  type StorefrontCustomer,
} from "@/server/auth/auth-service";
import {
  verifyCustomerSession,
  verifyStaffSession,
  type CustomerSessionPayload,
  type StaffSessionPayload,
} from "@/server/auth/tokens";
import type { RequestContext } from "@/server/context";
import { CART_COOKIE, CART_COOKIE_MAX_AGE, CUSTOMER_COOKIE, STAFF_COOKIE, cookieOptions } from "./cookies";

/**
 * Adapter between the Next.js request (cookies) and the framework-free auth
 * service. Server components, server actions and route handlers call this;
 * services never do.
 */

export async function getStaffSession(): Promise<StaffSessionPayload | null> {
  const store = await cookies();
  return verifyStaffSession(store.get(STAFF_COOKIE)?.value);
}

export async function getCustomerSession(): Promise<CustomerSessionPayload | null> {
  const store = await cookies();
  return verifyCustomerSession(store.get(CUSTOMER_COOKIE)?.value);
}

export const getCurrentStaff = cache(async (restaurantSlug?: string): Promise<StaffActor | null> => {
  const session = await getStaffSession();
  return session ? authenticateStaff(session, restaurantSlug) : null;
});

export async function requireStaff(restaurantSlug?: string): Promise<StaffActor> {
  const actor = await getCurrentStaff(restaurantSlug);
  if (!actor) throw errors.unauthorized();
  return actor;
}

export async function requirePermission(permission: Permission, restaurantSlug?: string): Promise<StaffActor> {
  const actor = await requireStaff(restaurantSlug);
  assertPermission(actor, permission);
  return actor;
}

export async function getStorefrontCustomer(restaurantId: string): Promise<StorefrontCustomer | null> {
  const session = await getCustomerSession();
  return session ? resolveCustomer(session, restaurantId) : null;
}

/** The guest cart token, or null when the visitor has not started a cart. */
export async function getCartToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(CART_COOKIE)?.value || null;
}

/** Stores a freshly minted cart token. Only valid in Server Actions and Route Handlers. */
export async function setCartToken(token: string): Promise<void> {
  const store = await cookies();
  store.set(CART_COOKIE, token, cookieOptions(CART_COOKIE_MAX_AGE));
}

/**
 * Who is visiting this restaurant's storefront: the cart cookie and the
 * signed-in customer, in the shape services expect. Never sets cookies.
 */
export async function getVisitorContext(restaurantId: string): Promise<RequestContext> {
  const [cartToken, customer] = await Promise.all([getCartToken(), getStorefrontCustomer(restaurantId)]);
  return {
    restaurantId,
    cartToken,
    customerId: customer?.customerId ?? null,
    userId: customer?.userId ?? null,
  };
}
