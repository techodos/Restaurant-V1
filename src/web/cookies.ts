import { headers } from "next/headers";
import { config } from "@/server/config";

/** Cookie names and attributes. Nothing outside `web/` knows how sessions travel. */

/**
 * Staff session, path-scoped to one restaurant's admin (/r/<slug>/admin), so only that restaurant's session is ever
 * sent. A new name (was rp_staff_session at "/"): with one shared name a leftover "/" cookie would shadow the scoped
 * one, because Next's cookie parser keeps the last duplicate.
 */
export const STAFF_COOKIE = "rp_admin_session";
/**
 * Super admin session. Unlike STAFF_COOKIE it is scoped to "/" because one login works in /super-admin and in every
 * restaurant's admin. A restaurant-scoped STAFF_COOKIE, when present, still wins (web/session.ts#getStaffSession).
 */
export const SUPER_ADMIN_COOKIE = "rp_super_admin_session";
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
/**
 * A guest's last few orders: signed order-access tokens joined by "~" (never in a JWT), newest first.
 * The only way a guest's browser can show its own orders — there is no database cart to match any more.
 */
export const GUEST_ORDERS_COOKIE = "rp_guest_orders";
/** CSRF state for the Google OAuth redirect round trip; cleared as soon as the callback reads it. */
export const GOOGLE_STATE_COOKIE = "rp_google_state";
/** Where to return the browser after the Google OAuth round trip; cleared as soon as the callback reads it. */
export const GOOGLE_RETURN_TO_COOKIE = "rp_google_return_to";

/**
 * `secure` follows the actual connection, not just NODE_ENV: a real deployment sits behind an HTTPS
 * reverse proxy (Vercel or nginx/Caddy, section 10) which sets `x-forwarded-proto: https`, so this
 * still resolves `true` there. A bare `next start` reached over plain HTTP — e.g. testing on a phone
 * at the LAN IP (`http://192.168.x.x:3000`) — has no proxy to set that header; NODE_ENV alone would
 * still say "production" and force `secure: true`, and a Secure cookie set over plain HTTP to
 * anything other than `localhost` (which browsers special-case as a secure context) is silently
 * dropped by the browser. Sign-in then "succeeds" (the action's response, and the toast with it) but
 * no cookie is ever stored, so the very next page load finds no session and bounces back to sign-in —
 * found 2026-10-10 testing sign-in on a phone against `next start` at a LAN IP.
 */
export async function cookieOptions(maxAge: number) {
  const proto = (await headers()).get("x-forwarded-proto");
  const secure = proto ? proto === "https" : config.app.isProduction;
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge,
  };
}
