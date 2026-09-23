import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppError, errors } from "@/server/errors";
import { effectivePermissions, type Permission } from "@/server/auth/permissions";
import {
  assertPermission,
  authenticateStaff,
  resolveCustomer,
  signInStaff,
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
import {
  CART_COOKIE,
  CART_COOKIE_MAX_AGE,
  CART_COUNT_COOKIE,
  CUSTOMER_COOKIE,
  GOOGLE_RETURN_TO_COOKIE,
  GOOGLE_STATE_COOKIE,
  STAFF_COOKIE,
  cookieOptions,
} from "./cookies";

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

/** Admin layout guard: redirects to /admin/login instead of throwing UNAUTHORIZED. */
export async function requireStaffForAdmin(): Promise<StaffActor> {
  try {
    return await requireStaff();
  } catch (error) {
    if (error instanceof AppError && error.code === "UNAUTHORIZED") redirect("/admin/login");
    throw error;
  }
}

/** Staff sign-in: authenticates, then sets the staff session cookie. Server Actions/Route Handlers only. */
export async function signInStaffSession(
  email: string,
  password: string,
  restaurantSlug: string,
  identifier = "unknown",
): Promise<StaffActor> {
  const { token, maxAge, member, restaurant } = await signInStaff(email, password, restaurantSlug, identifier);
  const store = await cookies();
  store.set(STAFF_COOKIE, token, cookieOptions(maxAge));
  return {
    // signInStaff already rejects a member with no linked login.
    userId: member.userId as string,
    email: member.email,
    name: member.fullName,
    restaurantId: restaurant.id,
    role: member.role,
    member,
    permissions: effectivePermissions(member.role, member.permissions),
  };
}

/** Ends the staff session. Server Actions/Route Handlers only. */
export async function signOutStaffSession(): Promise<void> {
  const store = await cookies();
  store.delete(STAFF_COOKIE);
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

/** Signs the customer in for this browser. Only valid in Server Actions and Route Handlers. */
export async function setCustomerSession(token: string, maxAge: number): Promise<void> {
  const store = await cookies();
  store.set(CUSTOMER_COOKIE, token, cookieOptions(maxAge));
}

/** Signs the customer out of this browser. Only valid in Server Actions and Route Handlers. */
export async function clearCustomerSession(): Promise<void> {
  const store = await cookies();
  store.delete(CUSTOMER_COOKIE);
}

/** Stores the CSRF state for a Google sign-in redirect just before leaving for Google. */
export async function setGoogleState(state: string): Promise<void> {
  const store = await cookies();
  store.set(GOOGLE_STATE_COOKIE, state, cookieOptions(600));
}

/** Reads and clears the state cookie; the caller compares it against Google's callback `state`. */
export async function consumeGoogleState(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(GOOGLE_STATE_COOKIE)?.value ?? null;
  store.delete(GOOGLE_STATE_COOKIE);
  return value;
}

/** Stores the page to return to after the Google OAuth round trip (the page "Continue with Google" was opened from). */
export async function setGoogleReturnTo(path: string): Promise<void> {
  const store = await cookies();
  store.set(GOOGLE_RETURN_TO_COOKIE, path, cookieOptions(600));
}

/** Reads and clears the return-to cookie. */
export async function consumeGoogleReturnTo(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(GOOGLE_RETURN_TO_COOKIE)?.value ?? null;
  store.delete(GOOGLE_RETURN_TO_COOKIE);
  return value;
}

const CART_COUNT_MAX = 999;

/**
 * Items in the visitor's cart as last recorded by a cart action, for the header
 * badge. Reading the cart from the database on every page view costs a full
 * transaction; this costs nothing. It is a display hint only — the cart and
 * checkout pages, and every cart mutation, use the real cart — so a tampered or
 * stale value can only show a wrong number in the badge until the next cart action.
 */
export async function getCartCountHint(): Promise<number> {
  const store = await cookies();
  const count = Number.parseInt(store.get(CART_COUNT_COOKIE)?.value ?? "", 10);
  return Number.isFinite(count) ? Math.min(Math.max(count, 0), CART_COUNT_MAX) : 0;
}

/** Records the cart size for the header badge. Only valid in Server Actions and Route Handlers. */
export async function setCartCountHint(count: number): Promise<void> {
  const store = await cookies();
  const safe = Math.min(Math.max(Math.trunc(count) || 0, 0), CART_COUNT_MAX);
  store.set(CART_COUNT_COOKIE, String(safe), cookieOptions(CART_COOKIE_MAX_AGE));
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
