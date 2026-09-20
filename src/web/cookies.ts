import { config } from "@/server/config";

/** Cookie names and attributes. Nothing outside `web/` knows how sessions travel. */

export const STAFF_COOKIE = "rp_staff_session";
export const CUSTOMER_COOKIE = "rp_customer_session";
export const CART_COOKIE = "rp_cart";

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
