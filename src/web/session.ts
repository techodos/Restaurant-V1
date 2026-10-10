import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppError, errors } from "@/server/errors";
import { effectivePermissions, type Permission } from "@/server/auth/permissions";
import { assertRestaurantWide } from "@/server/auth/branch-scope";
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
  verifyOrderAccessToken,
  verifyStaffSession,
  SESSION_TTL,
  type CustomerSessionPayload,
  type StaffSessionPayload,
} from "@/server/auth/tokens";
import type { RequestContext } from "@/server/context";
import { config } from "@/server/config";
import { reissueCustomerSession } from "@/server/services/customer-auth";
import { adminPath, adminSlugFromPath } from "@/shared/utils";
import { PATHNAME_HEADER } from "@/middleware";
import { entitlementForPermission, isEntitled } from "@/shared/feature-access";
import { getAdminRestaurantContext } from "@/server/services/restaurants";
import {
  CUSTOMER_COOKIE,
  LEGACY_CART_COOKIE,
  LEGACY_CART_COUNT_COOKIE,
  GOOGLE_RETURN_TO_COOKIE,
  GOOGLE_STATE_COOKIE,
  GUEST_ORDERS_COOKIE,
  STAFF_COOKIE,
  SUPER_ADMIN_COOKIE,
  LEGACY_STAFF_COOKIE,
  cookieOptions,
} from "./cookies";

/**
 * Adapter between the Next.js request (cookies) and the framework-free auth
 * service. Server components, server actions and route handlers call this;
 * services never do.
 */

export async function getStaffSession(): Promise<StaffSessionPayload | null> {
  const store = await cookies();
  // a restaurant-scoped session wins; the super admin one (path "/") covers every restaurant and /super-admin
  return (
    (await verifyStaffSession(store.get(STAFF_COOKIE)?.value)) ??
    (await verifyStaffSession(store.get(SUPER_ADMIN_COOKIE)?.value))
  );
}

export async function getCustomerSession(): Promise<CustomerSessionPayload | null> {
  const store = await cookies();
  return verifyCustomerSession(store.get(CUSTOMER_COOKIE)?.value);
}

/**
 * True while handling a Server Action (the client sends its id in the `Next-Action` header). Every admin
 * write is a Server Action — the admin route handlers are GET-only — so this is where staff membership
 * must be re-read rather than served from the short per-process cache.
 */
export const isServerActionRequest = cache(async (): Promise<boolean> => {
  return (await headers()).has("next-action");
});

/**
 * The restaurant whose admin this request is for, from the path the middleware stamps on every /r/* request
 * (a Server Action POSTs to the page it was called from). Without it a slug-less check fell back to the
 * member's HOME restaurant, so a super admin working in restaurant B's admin wrote into restaurant A. It only
 * narrows which membership is checked (authenticateStaff still requires one there), so it can never widen access.
 */
async function adminSlugFromRequest(): Promise<string | undefined> {
  return adminSlugFromPath((await headers()).get(PATHNAME_HEADER)) ?? undefined;
}

export const getCurrentStaff = cache(async (slug?: string): Promise<StaffActor | null> => {
  const session = await getStaffSession();
  if (!session) return null;
  const restaurantSlug = slug ?? (await adminSlugFromRequest());
  // page views and GET routes: cached membership (≤30 s); writes: always the database
  return authenticateStaff(session, restaurantSlug, { fresh: await isServerActionRequest() });
});

export async function requireStaff(restaurantSlug?: string): Promise<StaffActor> {
  const actor = await getCurrentStaff(restaurantSlug);
  if (!actor) throw errors.unauthorized();
  return actor;
}

/**
 * The signed-in platform super admin (role re-read from the database, `fresh` for Server Actions), or null.
 * Reads only the super admin cookie: a restaurant staff session is never a way into /super-admin.
 */
export const getSuperAdmin = cache(async (): Promise<StaffActor | null> => {
  const session = await verifyStaffSession((await cookies()).get(SUPER_ADMIN_COOKIE)?.value);
  if (!session || session.role !== "super_admin") return null;
  const actor = await authenticateStaff(session, undefined, { fresh: await isServerActionRequest() });
  return actor?.role === "super_admin" ? actor : null;
});

/** Server Actions/Route Handlers: refuses anyone but a super admin. */
export async function requireSuperAdmin(): Promise<StaffActor> {
  const actor = await getSuperAdmin();
  if (!actor) throw errors.forbidden("Only a platform super admin can do that.");
  return actor;
}

/** Pages: anyone else goes to the default restaurant's admin sign-in (super admins sign in there, like everyone). */
export async function requireSuperAdminPage(): Promise<StaffActor> {
  const actor = await getSuperAdmin();
  if (!actor) redirect(adminPath(config.app.defaultRestaurantSlug, "/login"));
  return actor;
}

export async function requirePermission(permission: Permission, restaurantSlug?: string): Promise<StaffActor> {
  const actor = await requireStaff(restaurantSlug);
  assertPermission(actor, permission);
  if (!(await isEntitledFor(actor, permission))) throw errors.forbidden("This feature is not enabled for your restaurant.");
  return actor;
}

/**
 * Has the platform switched off the screen/feature behind `permission` for this restaurant (restaurants.entitlements)?
 * A super admin is exempt, so they can still open everything they turned off. Same per-process cache as the admin shell.
 */
async function isEntitledFor(actor: StaffActor, permission: Permission): Promise<boolean> {
  const key = entitlementForPermission(permission);
  if (!key || actor.role === "super_admin") return true;
  const { restaurant } = await getAdminRestaurantContext(actor.restaurantSlug);
  return isEntitled(restaurant.entitlements, key);
}

/**
 * `requirePermission` for data every branch shares (the menu catalogue, coupons): branch-scoped staff are
 * refused even when their role holds the permission, because a change there reaches every branch.
 */
export async function requireRestaurantWidePermission(permission: Permission, restaurantSlug?: string): Promise<StaffActor> {
  const actor = await requirePermission(permission, restaurantSlug);
  assertRestaurantWide(actor);
  return actor;
}

/**
 * Page guard for /r/<slug>/admin pages (not actions or route handlers, which keep their FORBIDDEN error):
 * a member who opens a screen their role or branch does not allow (a typed URL, an old bookmark) is sent
 * to the dashboard with a "no access" notice. Rendering the error boundary instead showed "Something went
 * wrong", since production builds hide server error messages. The page never renders either way.
 */
export async function requireAdminPage(
  permission: Permission,
  restaurantSlug: string,
  options: { restaurantWide?: boolean } = {},
): Promise<StaffActor> {
  const actor = await requireStaffForAdmin(restaurantSlug);
  const allowed =
    actor.permissions.includes(permission) &&
    (!options.restaurantWide || actor.member.locationId === null) &&
    (await isEntitledFor(actor, permission));
  if (!allowed) redirect(`${adminPath(restaurantSlug)}?denied=1`);
  return actor;
}

/** The caller's IP (first X-Forwarded-For hop), used to key sign-in rate limits per caller. */
export async function callerIdentifier(): Promise<string> {
  const store = await headers();
  return store.get("x-forwarded-for")?.split(",")[0]?.trim() || store.get("x-real-ip") || "unknown";
}

/**
 * Admin guard for /r/<slug>/admin: the session must belong to a member of THAT restaurant, otherwise the
 * visitor is sent to that restaurant's own admin login (never another tenant's).
 */
export async function requireStaffForAdmin(restaurantSlug: string): Promise<StaffActor> {
  try {
    return await requireStaff(restaurantSlug);
  } catch (error) {
    if (error instanceof AppError && error.code === "UNAUTHORIZED") redirect(adminPath(restaurantSlug, "/login"));
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
  // Scoped to /r/<slug>/admin: each restaurant's admin keeps its own session (signing in to one never
  // replaces another's), and the cookie never travels with storefront requests.
  if (member.role === "super_admin") store.set(SUPER_ADMIN_COOKIE, token, await cookieOptions(maxAge));
  else store.set(STAFF_COOKIE, token, { ...(await cookieOptions(maxAge)), path: adminPath(restaurant.slug) });
  return {
    // signInStaff already rejects a member with no linked login.
    userId: member.userId as string,
    email: member.email,
    name: member.fullName,
    restaurantId: restaurant.id,
    restaurantSlug: restaurant.slug,
    role: member.role,
    member,
    permissions: effectivePermissions(member.role, member.permissions),
  };
}

/** Ends one restaurant's admin session. Server Actions/Route Handlers only. */
export async function signOutStaffSession(restaurantSlug: string): Promise<void> {
  const store = await cookies();
  store.delete({ name: STAFF_COOKIE, path: adminPath(restaurantSlug) });
  store.delete({ name: SUPER_ADMIN_COOKIE, path: "/" });
  // the pre-/r/<slug>/admin cookie, if this browser still has one
  store.delete({ name: LEGACY_STAFF_COOKIE, path: "/" });
}

/**
 * The signed-in customer, from the signed session cookie alone — no database read (see
 * `resolveCustomer`). Cached per request so layout, page and actions share one JWT verification.
 */
export const getStorefrontCustomer = cache(async (restaurantId: string): Promise<StorefrontCustomer | null> => {
  const session = await getCustomerSession();
  return session ? resolveCustomer(session, restaurantId) : null;
});

/** Signs the customer in for this browser. Only valid in Server Actions and Route Handlers. */
export async function setCustomerSession(token: string, maxAge: number): Promise<void> {
  const store = await cookies();
  store.set(CUSTOMER_COOKIE, token, await cookieOptions(maxAge));
}

/**
 * Re-signs the current customer's session with updated claims (email just verified, name changed), so
 * pages keep reading them from the cookie instead of the database. Server Actions/Route Handlers only.
 */
export async function refreshCustomerSession(patch: { name?: string; emailVerified?: boolean }): Promise<void> {
  const session = await getCustomerSession();
  if (!session) return;
  const token = await reissueCustomerSession(session, patch);
  const store = await cookies();
  store.set(CUSTOMER_COOKIE, token, await cookieOptions(SESSION_TTL.customer));
}

/**
 * Signs the customer out of this browser. The tray is the browser's, not the account's (it lives in its
 * own cookie), so it stays. Only valid in Server Actions and Route Handlers.
 */
export async function clearCustomerSession(): Promise<void> {
  const store = await cookies();
  store.delete(CUSTOMER_COOKIE);
  // cookies from the database-cart era; nothing reads them any more
  store.delete(LEGACY_CART_COOKIE);
  store.delete(LEGACY_CART_COUNT_COOKIE);
}

/** Stores the CSRF state for a Google sign-in redirect just before leaving for Google. */
export async function setGoogleState(state: string): Promise<void> {
  const store = await cookies();
  store.set(GOOGLE_STATE_COOKIE, state, await cookieOptions(600));
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
  store.set(GOOGLE_RETURN_TO_COOKIE, path, await cookieOptions(600));
}

/** Reads and clears the return-to cookie. */
export async function consumeGoogleReturnTo(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(GOOGLE_RETURN_TO_COOKIE)?.value ?? null;
  store.delete(GOOGLE_RETURN_TO_COOKIE);
  return value;
}

// ── A guest's own orders ──────────────────────────────────────────────────────────────────────────
// There is no database cart (the tray is a cookie), so a guest proves ownership of an order the same
// way a notification email link does: a signed order-access token (auth/tokens.ts, 60 days, one order).
// Checkout stores it in GUEST_ORDERS_COOKIE (httpOnly); only tokens that verify for this restaurant count.

const MAX_GUEST_ORDERS = 5;
const GUEST_ORDERS_MAX_AGE = 60 * 60 * 24 * 60; // the tokens' own lifetime

async function readGuestOrderTokens(): Promise<string[]> {
  const value = (await cookies()).get(GUEST_ORDERS_COOKIE)?.value;
  return value ? value.split("~").filter(Boolean).slice(0, MAX_GUEST_ORDERS) : [];
}

/** Remembers a guest's freshly placed order in this browser (newest first). Server Actions/Route Handlers only. */
export async function rememberGuestOrder(token: string): Promise<void> {
  const tokens = [token, ...(await readGuestOrderTokens()).filter((existing) => existing !== token)];
  (await cookies()).set(GUEST_ORDERS_COOKIE, tokens.slice(0, MAX_GUEST_ORDERS).join("~"), await cookieOptions(GUEST_ORDERS_MAX_AGE));
}

/** This browser's verified guest-order grants for one restaurant (signature checks only, no database). */
export const getGuestOrderGrants = cache(async (restaurantId: string): Promise<{ token: string; orderId: string; orderNumber: string | null }[]> => {
  const grants = await Promise.all(
    (await readGuestOrderTokens()).map(async (token) => ({ token, grant: await verifyOrderAccessToken(token) })),
  );
  return grants.flatMap(({ token, grant }) =>
    grant && grant.restaurantId === restaurantId ? [{ token, orderId: grant.orderId, orderNumber: grant.orderNumber ?? null }] : [],
  );
});

/** The saved access token for one of this browser's guest orders, or null — used where a page takes `?t=`. */
export async function guestOrderAccessToken(restaurantId: string, orderNumber: string): Promise<string | null> {
  return (await getGuestOrderGrants(restaurantId)).find((grant) => grant.orderNumber === orderNumber)?.token ?? null;
}

/**
 * Who is visiting this restaurant's storefront — the signed-in customer, in the shape services expect.
 * From cookies only (no database). Never sets cookies. A guest carries the ids of orders this browser
 * placed (`guestOrderIds`), which is how "Current orders" finds them.
 */
export async function getVisitorContext(restaurantId: string): Promise<RequestContext> {
  const customer = await getStorefrontCustomer(restaurantId);
  return {
    restaurantId,
    cartToken: null,
    customerId: customer?.customerId ?? null,
    userId: customer?.userId ?? null,
    guestOrderIds: customer ? null : (await getGuestOrderGrants(restaurantId)).map((grant) => grant.orderId),
  };
}
