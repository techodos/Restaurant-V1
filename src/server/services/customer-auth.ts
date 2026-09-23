import { createHmac, randomInt, randomUUID } from "node:crypto";
import { config } from "@/server/config";
import { errors } from "@/server/errors";
import { checkRateLimit } from "@/server/rate-limit";
import {
  createCustomerAccount,
  resolveCustomer,
  signInCustomer,
  type CustomerSignInResult,
} from "@/server/auth/auth-service";
import {
  signCustomerSession,
  signGooglePendingToken,
  verifyCustomerSession,
  verifyGooglePendingToken,
  SESSION_TTL,
  type CustomerSessionPayload,
} from "@/server/auth/tokens";
import { buildGoogleAuthUrl, resolveGoogleIdentity } from "@/server/integrations/google";
import { getEmailProvider } from "@/server/services/notifications";
import { renderVerificationCodeEmail } from "@/server/notifications/templates/email-verification";
import {
  consumeVerificationCode,
  createVerificationCode,
  getActiveVerificationCode,
  recordVerificationAttempt,
} from "@/server/repositories/email-verification";
import {
  getCustomerById,
  getCustomerByGoogleSubOrEmail,
  markCustomerEmailVerified,
  linkGoogleToCustomer,
  createGoogleCustomer,
} from "@/server/repositories/customers";
import { getRestaurantBySlug } from "@/server/repositories/restaurants";
import type { SignInInput, SignUpInput } from "@/server/validation/customer-auth";

/**
 * Customer sign-in/sign-up, "Continue with Google", and the checkout email-verification
 * gate. Session cookies are set by the delivery layer (server actions), not here — this
 * module only returns the signed token, same convention as auth-service.ts.
 */

const CODE_TTL_MINUTES = 10;
const MAX_CODE_ATTEMPTS = 5;

export async function signUpCustomer(restaurantSlug: string, input: SignUpInput, identifier: string): Promise<CustomerSignInResult> {
  return createCustomerAccount(
    { restaurantSlug, fullName: input.fullName, email: input.email, phone: input.phone, password: input.password },
    identifier,
  );
}

export async function signInCustomerAccount(restaurantSlug: string, input: SignInInput, identifier: string): Promise<CustomerSignInResult> {
  return signInCustomer(input.email, input.password, restaurantSlug, identifier);
}

// ── Email verification (checkout gate) ──────────────────────────────────────

function hashCode(code: string): string {
  return createHmac("sha256", config.auth.secret).update(code).digest("hex");
}

/** True once the signed-in customer's login email is verified. Guests are never gated. */
export async function isEmailVerified(customerId: string): Promise<boolean> {
  const customer = await getCustomerById(customerId, { customerId });
  return customer?.emailVerified ?? false;
}

export async function getCustomerUser(customerId: string) {
  return getCustomerById(customerId, { customerId });
}

/** Sends a fresh 6-digit code, replacing any still-active one for this customer (rate-limited). */
export async function sendVerificationCode(customerId: string, email: string, identifier: string, restaurantSlug: string): Promise<void> {
  checkRateLimit({ key: "email-verify-send", identifier: customerId, limit: 3, windowMs: 5 * 60_000 });
  checkRateLimit({ key: "email-verify-send-ip", identifier, limit: 8, windowMs: 15 * 60_000 });

  const restaurant = await getRestaurantBySlug(restaurantSlug).catch(() => null);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await createVerificationCode({
    customerId,
    email,
    codeHash: hashCode(code),
    expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000),
  });

  const provider = getEmailProvider();
  if (!provider) return; // email not configured: nothing sendable, checkout stays gated until it is

  const rendered = renderVerificationCodeEmail({
    brand: {
      name: restaurant?.name ?? "Restaurant Platform",
      logoUrl: restaurant?.logoUrl ?? null,
      primaryColor: restaurant?.primaryColor ?? null,
      email: restaurant?.email ?? null,
      phone: restaurant?.phone ?? null,
    },
    code,
  });
  await provider.send({
    to: email,
    fromName: restaurant?.name ?? "Restaurant Platform",
    replyTo: restaurant?.email ?? null,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    idempotencyKey: `email-verify-${customerId}-${randomUUID()}`,
  });
}

/** Sends a code only when there is no still-active one, so opening the checkout gate never spams a fresh code on every render. */
export async function ensureVerificationCode(customerId: string, email: string, identifier: string, restaurantSlug: string): Promise<void> {
  const active = await getActiveVerificationCode(customerId);
  if (active) return;
  await sendVerificationCode(customerId, email, identifier, restaurantSlug);
}

export async function verifyEmailCode(customerId: string, code: string): Promise<void> {
  const active = await getActiveVerificationCode(customerId);
  if (!active) throw errors.validation("That code has expired. Request a new one.");
  if (active.attempts >= active.maxAttempts) throw errors.validation("Too many attempts. Request a new code.");

  await recordVerificationAttempt(active.id);
  if (active.attempts + 1 > MAX_CODE_ATTEMPTS || hashCode(code) !== active.codeHash) {
    throw errors.validation("That code is not correct.");
  }
  await consumeVerificationCode(active.id);
  await markCustomerEmailVerified(customerId);
}

// ── Google sign-in ───────────────────────────────────────────────────────────

export function googleAuthAvailable(): boolean {
  return config.googleAuth !== null;
}

export function startGoogleAuth(redirectUri: string, state: string): string {
  const google = config.googleAuth;
  if (!google) throw errors.validation("Google sign-in is not configured.");
  return buildGoogleAuthUrl({ ...google, redirectUri, state });
}

export type GoogleAuthResult =
  | { status: "signed-in"; token: string; maxAge: number; customerId: string }
  /** No `customers` row exists yet at this restaurant: phone is mandatory and Google never provides one. */
  | { status: "needs-phone"; pendingToken: string; email: string; name: string };

/**
 * Exchanges the OAuth code and signs in or asks for a phone number — restaurant-scoped
 * throughout (0021: a customer's login lives on `customers` directly, one row per
 * restaurant, so there's no separate cross-restaurant identity to resolve first).
 */
export async function completeGoogleAuth(restaurantSlug: string, code: string, redirectUri: string): Promise<GoogleAuthResult> {
  const google = config.googleAuth;
  if (!google) throw errors.validation("Google sign-in is not configured.");

  const identity = await resolveGoogleIdentity({ ...google, code, redirectUri });
  if (!identity.emailVerified) throw errors.validation("Your Google account's email is not verified.");

  const restaurant = await getRestaurantBySlug(restaurantSlug);
  if (!restaurant) throw errors.notFound("Restaurant");

  const existing = await getCustomerByGoogleSubOrEmail(restaurant.id, identity.sub, identity.email, { restaurantId: restaurant.id });
  if (existing) {
    if (!existing.authProvider.includes("google")) {
      await linkGoogleToCustomer(existing.id, identity.sub, { restaurantId: restaurant.id, customerId: existing.id });
    }
    const token = await signCustomerSession({ sub: existing.id, customerId: existing.id, restaurantId: restaurant.id, name: identity.name });
    return { status: "signed-in", token, maxAge: SESSION_TTL.customer, customerId: existing.id };
  }

  const pendingToken = await signGooglePendingToken({
    googleSub: identity.sub,
    email: identity.email,
    name: identity.name,
    restaurantId: restaurant.id,
  });
  return { status: "needs-phone", pendingToken, email: identity.email, name: identity.name };
}

/** Completes a Google sign-up once the customer supplies the phone number `customers` requires. */
export async function finishGoogleSignup(pendingToken: string, phone: string): Promise<CustomerSignInResult> {
  const grant = await verifyGooglePendingToken(pendingToken);
  if (!grant) throw errors.validation("This sign-up link has expired. Please try Google sign-in again.");

  const customer = await createGoogleCustomer(
    { restaurantId: grant.restaurantId, fullName: grant.name, email: grant.email, phone, googleSub: grant.googleSub },
    { restaurantId: grant.restaurantId },
  );
  const customerId = customer.id;

  const token = await signCustomerSession({
    sub: customerId,
    customerId,
    restaurantId: grant.restaurantId,
    name: grant.name,
  });
  return { token, maxAge: SESSION_TTL.customer, customerId };
}

export async function currentCustomerUserId(session: CustomerSessionPayload | null, restaurantId: string): Promise<string | null> {
  if (!session) return null;
  const customer = await resolveCustomer(session, restaurantId);
  return customer?.userId ?? null;
}

export { verifyCustomerSession };
