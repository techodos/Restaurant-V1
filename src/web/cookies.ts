import { config } from "@/server/config";

/** Cookie names and attributes. Nothing outside `web/` knows how sessions travel. */

/**
 * Staff session, path-scoped to one restaurant's admin (/r/<slug>/admin), so only that restaurant's session is ever
 * sent. A new name (was rp_staff_session at "/"): with one shared name a leftover "/" cookie would shadow the scoped
 * one, because Next's cookie parser keeps the last duplicate.
 */
export const STAFF_COOKIE = "rp_admin_session";
/** Restaurant-wide staff's chosen branch in the admin (a location id or "all"); path /r/<slug>/admin. */
export const ADMIN_BRANCH_COOKIE = "rp_admin_branch";
/** Pre-2026-09-27 staff cookie (path "/"); only ever deleted. */
export const LEGACY_STAFF_COOKIE = "rp_staff_session";
export const CUSTOMER_COOKIE = "rp_customer_session";
/**
 * Database-cart era cookies (a cart token and a badge-count hint). The tray now lives in its own
 * browser-written cookie (`shared/tray.ts#trayCookieName`); these are only deleted on sign-out.
 */
export const LEGACY_CART_COOKIE = "rp_cart";
export const LEGACY_CART_COUNT_COOKIE = "rp_cart_n";
/** CSRF state for the Google OAuth redirect round trip; cleared as soon as the callback reads it. */
export const GOOGLE_STATE_COOKIE = "rp_google_state";
/** Where to return the browser after the Google OAuth round trip; cleared as soon as the callback reads it. */
export const GOOGLE_RETURN_TO_COOKIE = "rp_google_return_to";

export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: config.app.isProduction,
    path: "/",
    maxAge,
  };
}
