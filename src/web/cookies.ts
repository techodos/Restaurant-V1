import { config } from "@/server/config";

/** Cookie names and attributes. Nothing outside `web/` knows how sessions travel. */

export const STAFF_COOKIE = "rp_staff_session";
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
