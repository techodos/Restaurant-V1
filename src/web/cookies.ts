import { config } from "@/server/config";

/** Cookie names and attributes. Nothing outside `web/` knows how sessions travel. */

/**
 * Staff session, path-scoped to one restaurant's admin (/r/<slug>/admin), so only that restaurant's session is ever
 * sent. A new name (was rp_staff_session at "/"): with one shared name a leftover "/" cookie would shadow the scoped
 * one, because Next's cookie parser keeps the last duplicate.
 */
export const STAFF_COOKIE = "rp_admin_session";
/** Pre-2026-09-27 staff cookie (path "/"); only ever deleted. */
export const LEGACY_STAFF_COOKIE = "rp_staff_session";
export const CUSTOMER_COOKIE = "rp_customer_session";
export const CART_COOKIE = "rp_cart";
/** Display hint for the header cart badge; the database cart stays the source of truth. */
export const CART_COUNT_COOKIE = "rp_cart_n";
/** CSRF state for the Google OAuth redirect round trip; cleared as soon as the callback reads it. */
export const GOOGLE_STATE_COOKIE = "rp_google_state";
/** Where to return the browser after the Google OAuth round trip; cleared as soon as the callback reads it. */
export const GOOGLE_RETURN_TO_COOKIE = "rp_google_return_to";

export const CART_COOKIE_MAX_AGE = 60 * 60 * 24 * 120;

export function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: config.app.isProduction,
    path: "/",
    maxAge,
  };
}
