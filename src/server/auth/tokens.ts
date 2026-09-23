import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { config } from "@/server/config";

/**
 * Session tokens are short-lived HS256 JWTs. The delivery layer decides where
 * they travel (today: HttpOnly cookies, see web/cookies.ts). The same JWT shape
 * can be produced by Supabase Auth; `sub` is the auth.users id (staff) or customers.id (customer), which is what
 * the RLS helpers read.
 */

const ISSUER = "restaurant-platform";
const STAFF_TTL_SECONDS = 60 * 60 * 12; // 12h shift
const CUSTOMER_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface StaffSessionPayload extends JWTPayload {
  sub: string;
  email: string;
  name: string;
  restaurantId: string;
  role: "owner" | "admin" | "manager" | "staff";
}

export interface CustomerSessionPayload extends JWTPayload {
  sub: string;
  customerId: string;
  restaurantId: string;
  name: string;
}

function secret(): Uint8Array {
  return new TextEncoder().encode(config.auth.secret);
}

export async function signStaffSession(
  payload: Omit<StaffSessionPayload, "iat" | "exp" | "iss">,
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + STAFF_TTL_SECONDS)
    .sign(secret());
}

export async function signCustomerSession(
  payload: Omit<CustomerSessionPayload, "iat" | "exp" | "iss">,
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + CUSTOMER_TTL_SECONDS)
    .sign(secret());
}

export async function verifyStaffSession(token: string | undefined): Promise<StaffSessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: ISSUER });
    if (typeof payload.sub !== "string" || typeof payload.restaurantId !== "string") return null;
    return payload as StaffSessionPayload;
  } catch {
    return null;
  }
}

export async function verifyCustomerSession(token: string | undefined): Promise<CustomerSessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: ISSUER });
    if (typeof payload.customerId !== "string" || typeof payload.restaurantId !== "string") return null;
    return payload as CustomerSessionPayload;
  } catch {
    return null;
  }
}

export const SESSION_TTL = {
  staff: STAFF_TTL_SECONDS,
  customer: CUSTOMER_TTL_SECONDS,
};

/**
 * Order access links (emails). A signed token that names exactly one order lets
 * its holder open that order's tracking and review pages from any device,
 * because a guest's proof of ownership is otherwise a cookie on the ordering
 * browser. It deliberately carries neither `sub` nor `customerId`, so it can
 * never be accepted as a staff or customer session, and it says nothing beyond
 * "may view/review this order".
 */
const ORDER_ACCESS_PURPOSE = "order-access";
const ORDER_ACCESS_TTL_SECONDS = 60 * 60 * 24 * 60; // 60 days

export interface OrderAccessGrant {
  orderId: string;
  restaurantId: string;
}

export async function signOrderAccessToken(grant: OrderAccessGrant): Promise<string> {
  return new SignJWT({ purpose: ORDER_ACCESS_PURPOSE, oid: grant.orderId, rid: grant.restaurantId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ORDER_ACCESS_TTL_SECONDS)
    .sign(secret());
}

export async function verifyOrderAccessToken(token: string | undefined | null): Promise<OrderAccessGrant | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: ISSUER });
    if (payload.purpose !== ORDER_ACCESS_PURPOSE) return null;
    if (typeof payload.oid !== "string" || typeof payload.rid !== "string") return null;
    return { orderId: payload.oid, restaurantId: payload.rid };
  } catch {
    return null;
  }
}

/**
 * A verified Google identity that has no `customers` row yet at this restaurant (phone is
 * mandatory and part of that table's natural key, and Google never provides one). Short-lived and
 * single-purpose: it can only be redeemed by "finish sign-up with a phone number", never as a session.
 */
const GOOGLE_PENDING_PURPOSE = "google-pending";
const GOOGLE_PENDING_TTL_SECONDS = 60 * 15;

export interface GooglePendingGrant {
  googleSub: string;
  email: string;
  name: string;
  restaurantId: string;
}

export async function signGooglePendingToken(grant: GooglePendingGrant): Promise<string> {
  return new SignJWT({ purpose: GOOGLE_PENDING_PURPOSE, ...grant })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + GOOGLE_PENDING_TTL_SECONDS)
    .sign(secret());
}

export async function verifyGooglePendingToken(token: string | undefined | null): Promise<GooglePendingGrant | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: ISSUER });
    if (payload.purpose !== GOOGLE_PENDING_PURPOSE) return null;
    const { googleSub, email, name, restaurantId } = payload as Record<string, unknown>;
    if (typeof googleSub !== "string" || typeof email !== "string" || typeof name !== "string" || typeof restaurantId !== "string") {
      return null;
    }
    return { googleSub, email, name, restaurantId };
  } catch {
    return null;
  }
}
