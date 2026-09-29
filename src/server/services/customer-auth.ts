import { createHmac, randomInt, randomUUID } from "node:crypto";
import { config } from "@/server/config";
import type { RequestContext } from "@/server/context";
import { errors } from "@/server/errors";
import { checkRateLimit } from "@/server/rate-limit";
import {
  createCustomerAccount,
  findPasswordResetAccount,
  resetCustomerPassword,
  resolveCustomer,
  signInCustomer,
  type CustomerSignInResult,
} from "@/server/auth/auth-service";
import {
  signCustomerSession,
  signGooglePendingToken,
  signPasswordResetToken,
  verifyCustomerSession,
  verifyGooglePendingToken,
  verifyPasswordResetToken,
  SESSION_TTL,
  type CustomerSessionPayload,
} from "@/server/auth/tokens";
import { buildGoogleAuthUrl, resolveGoogleIdentity } from "@/server/integrations/google";
import { getEmailProvider } from "@/server/services/notifications";
import { renderVerificationCodeEmail, type CodeEmailPurpose } from "@/server/notifications/templates/email-verification";
import {
  attemptVerificationCode,
  createVerificationCode,
  getActiveVerificationCode,
} from "@/server/repositories/email-verification";
import {
  getCustomerById,
  getCustomerByGoogleSubOrEmail,
  linkGoogleToCustomer,
  createGoogleCustomer,
} from "@/server/repositories/customers";
import type { Restaurant } from "@/shared/contract/models";
import type { SignInInput, SignUpInput } from "@/server/validation/customer-auth";

/**
 * Customer sign-in/sign-up, "Continue with Google", and the checkout email-verification
 * gate. Session cookies are set by the delivery layer (server actions), not here — this
 * module only returns the signed token, same convention as auth-service.ts.
 */

const CODE_TTL_MINUTES = 10;
const MAX_CODE_ATTEMPTS = 5;

export async function signUpCustomer(restaurant: Pick<Restaurant, "id">, input: SignUpInput, identifier: string): Promise<CustomerSignInResult> {
  return createCustomerAccount(
    { restaurant, fullName: input.fullName, email: input.email, phone: input.phone, password: input.password },
    identifier,
  );
}

export async function signInCustomerAccount(restaurant: Pick<Restaurant, "id">, input: SignInInput, identifier: string): Promise<CustomerSignInResult> {
  return signInCustomer(input.email, input.password, restaurant, identifier);
}

// ── Email verification (checkout gate) ──────────────────────────────────────

function hashCode(code: string): string {
  return createHmac("sha256", config.auth.secret).update(code).digest("hex");
}

/**
 * Who may place an order: a signed-in customer (a customer session for this restaurant) whose login
 * email is verified. Guests are refused here with SIGN_IN_REQUIRED (no database needed). The email
 * check is authoritative inside the order transaction itself (`createOrder`, `requireVerifiedEmail`),
 * which refuses with EMAIL_NOT_VERIFIED — the checkout form turns that code into the inline
 * verify-code step. Hiding the checkout button for guests is only UX.
 */
export function assertCanPlaceOrder(visitor: Pick<RequestContext, "userId" | "customerId">): void {
  if (!visitor.customerId) throw errors.custom("SIGN_IN_REQUIRED", "Please sign in to place an order.");
}

export async function getCustomerUser(customerId: string) {
  return getCustomerById(customerId, { customerId });
}

/** Sends a fresh 6-digit code, replacing any still-active one for this customer (rate-limited). */
export async function sendVerificationCode(
  customerId: string,
  email: string,
  identifier: string,
  restaurant: Pick<Restaurant, "name" | "logoUrl" | "primaryColor" | "email" | "phone"> | null,
  purpose: CodeEmailPurpose = "verify",
): Promise<void> {
  checkRateLimit({ key: "email-verify-send", identifier: customerId, limit: 3, windowMs: 5 * 60_000 });
  checkRateLimit({ key: "email-verify-send-ip", identifier, limit: 8, windowMs: 15 * 60_000 });

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
    purpose,
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
export async function ensureVerificationCode(
  customerId: string,
  email: string,
  identifier: string,
  restaurant: Parameters<typeof sendVerificationCode>[3],
): Promise<void> {
  const active = await getActiveVerificationCode(customerId);
  if (active) return;
  await sendVerificationCode(customerId, email, identifier, restaurant);
}

/** One transaction: check, count, consume and mark verified together (`attemptVerificationCode`). */
export async function verifyEmailCode(customerId: string, code: string): Promise<void> {
  const outcome = await attemptVerificationCode(customerId, hashCode(code), MAX_CODE_ATTEMPTS);
  if (outcome === "expired") throw errors.validation("That code has expired. Request a new one.");
  if (outcome === "locked") throw errors.validation("Too many attempts. Request a new code.");
  if (outcome === "wrong") throw errors.validation("That code is not correct.");
}

// ── Forgot password ──────────────────────────────────────────────────────────
// Same code table, generator, TTL, attempt limit and email provider as email verification: a code is
// proof of owning the inbox either way, so a reset code and a verify code are interchangeable proofs.
// ponytail: no `purpose` column on email_verification_codes; add one (new migration) only if the two
// ever need different lifetimes or limits.

/**
 * Step 1: email a reset code. Answers the same way whether or not an account has that email (no
 * account enumeration). Rate limited per caller before the lookup, so unknown emails count too.
 */
export async function requestPasswordReset(
  restaurant: Pick<Restaurant, "id" | "name" | "logoUrl" | "primaryColor" | "email" | "phone">,
  email: string,
  identifier: string,
): Promise<void> {
  checkRateLimit({ key: "password-reset-request-ip", identifier, limit: 5, windowMs: 15 * 60_000 });
  const account = await findPasswordResetAccount(restaurant, email);
  if (!account) return;
  await sendVerificationCode(account.customerId, account.email, identifier, restaurant, "reset");
}

/** Step 2: check the code (the same one-transaction check as email verification) and hand back a short-lived reset token. */
export async function verifyPasswordResetCode(
  restaurant: Pick<Restaurant, "id">,
  email: string,
  code: string,
  identifier: string,
): Promise<string> {
  checkRateLimit({ key: "password-reset-verify-ip", identifier, limit: 20, windowMs: 15 * 60_000 });
  const account = await findPasswordResetAccount(restaurant, email);
  // unknown email: the same answer as a wrong code, so this step can't be used to probe for accounts
  if (!account) throw errors.validation("That code is not correct.");
  await verifyEmailCode(account.customerId, code);
  return signPasswordResetToken({
    customerId: account.customerId,
    restaurantId: restaurant.id,
    passwordFingerprint: account.passwordFingerprint,
  });
}

/** Step 3: set the new password (single-use token) and return a signed-in session. */
export async function completePasswordReset(
  restaurant: Pick<Restaurant, "id">,
  resetToken: string,
  newPassword: string,
): Promise<CustomerSignInResult> {
  const grant = await verifyPasswordResetToken(resetToken);
  if (!grant || grant.restaurantId !== restaurant.id) {
    throw errors.validation("This reset link has expired. Please start again.");
  }
  return resetCustomerPassword(grant, newPassword);
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
export async function completeGoogleAuth(restaurant: Pick<Restaurant, "id">, code: string, redirectUri: string): Promise<GoogleAuthResult> {
  const google = config.googleAuth;
  if (!google) throw errors.validation("Google sign-in is not configured.");

  const identity = await resolveGoogleIdentity({ ...google, code, redirectUri });
  if (!identity.emailVerified) throw errors.validation("Your Google account's email is not verified.");

  const existing = await getCustomerByGoogleSubOrEmail(restaurant.id, identity.sub, identity.email, { restaurantId: restaurant.id });
  if (existing) {
    if (!existing.authProvider.includes("google")) {
      await linkGoogleToCustomer(existing.id, identity.sub, { restaurantId: restaurant.id, customerId: existing.id });
    }
    // Google verified this email (checked above) and linking stores it as verified (linkGoogleToCustomer)
    const token = await signCustomerSession({
      sub: existing.id,
      customerId: existing.id,
      restaurantId: restaurant.id,
      name: identity.name,
      emailVerified: true,
    });
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
    emailVerified: true, // createGoogleCustomer stores the Google-verified email as verified
  });
  return { token, maxAge: SESSION_TTL.customer, customerId, emailVerified: true };
}

export function currentCustomerUserId(session: CustomerSessionPayload | null, restaurantId: string): string | null {
  if (!session) return null;
  return resolveCustomer(session, restaurantId)?.userId ?? null;
}

/** A fresh session token for an already signed-in customer, with updated claims (email verified, new name). */
export function reissueCustomerSession(
  session: CustomerSessionPayload,
  patch: Partial<Pick<CustomerSessionPayload, "name" | "emailVerified">>,
): Promise<string> {
  return signCustomerSession({
    sub: session.sub,
    customerId: session.customerId,
    restaurantId: session.restaurantId,
    name: patch.name ?? session.name,
    ...(patch.emailVerified !== undefined ? { emailVerified: patch.emailVerified } : session.emailVerified !== undefined ? { emailVerified: session.emailVerified } : {}),
  });
}

export { verifyCustomerSession };
