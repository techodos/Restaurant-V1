"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import type { ApiResult } from "@/shared/contract/api";
import { action, errors } from "@/server/errors";
import {
  completeGoogleAuth,
  ensureVerificationCode,
  finishGoogleSignup,
  getCustomerUser as getUserById,
  isEmailVerified,
  sendVerificationCode,
  signInCustomerAccount,
  signUpCustomer,
  startGoogleAuth,
  verifyEmailCode,
} from "@/server/services/customer-auth";
import { signInSchema, signUpSchema, verifyCodeSchema } from "@/server/validation/customer-auth";
import {
  getCustomerSession,
  setCustomerSession,
  clearCustomerSession,
  getStorefrontCustomer,
  setGoogleState,
  consumeGoogleState,
  setGoogleReturnTo,
  consumeGoogleReturnTo,
} from "@/web/session";
import { requireRestaurant } from "@/server/services/restaurants";
import { config } from "@/server/config";

async function callerIdentifier(): Promise<string> {
  const store = await headers();
  return store.get("x-forwarded-for")?.split(",")[0]?.trim() || store.get("x-real-ip") || "unknown";
}

export interface AuthResult {
  customerId: string;
  emailVerified: boolean;
}

export async function signUpAction(slug: string, payload: unknown): Promise<ApiResult<AuthResult>> {
  return action(async () => {
    const input = signUpSchema.parse(payload);
    const identifier = await callerIdentifier();
    const result = await signUpCustomer(slug, input, identifier);
    await setCustomerSession(result.token, result.maxAge);
    const restaurant = await requireRestaurant(slug);
    const customer = await getStorefrontCustomer(restaurant.id);
    if (customer) await sendVerificationCode(customer.userId, input.email, identifier, slug).catch(() => {});
    return { customerId: result.customerId, emailVerified: false };
  });
}

export async function signInAction(slug: string, payload: unknown): Promise<ApiResult<AuthResult>> {
  return action(async () => {
    const input = signInSchema.parse(payload);
    const identifier = await callerIdentifier();
    const result = await signInCustomerAccount(slug, input, identifier);
    await setCustomerSession(result.token, result.maxAge);
    const restaurant = await requireRestaurant(slug);
    const customer = await getStorefrontCustomer(restaurant.id);
    const verified = customer ? await isEmailVerified(customer.userId) : false;
    return { customerId: result.customerId, emailVerified: verified };
  });
}

export async function signOutAction(): Promise<ApiResult<null>> {
  return action(async () => {
    await clearCustomerSession();
    return null;
  });
}

/** Sends (or resends) the checkout email-verification code to the signed-in customer. */
export async function sendVerificationCodeAction(slug: string): Promise<ApiResult<null>> {
  return action(async () => {
    const restaurant = await requireRestaurant(slug);
    const customer = await getStorefrontCustomer(restaurant.id);
    if (!customer) throw errors.unauthorized("Please sign in first.");
    const user = await getUserById(customer.userId);
    if (!user?.email) throw errors.internal("Could not find this account.");
    const identifier = await callerIdentifier();
    await sendVerificationCode(customer.userId, user.email, identifier, slug).catch(() => {
      throw errors.internal("Could not send the verification code. Please try again.");
    });
    return null;
  });
}

/** Called when the checkout email-verify gate first appears; a no-op if a code is already in flight. */
export async function ensureVerificationCodeAction(slug: string): Promise<ApiResult<null>> {
  return action(async () => {
    const restaurant = await requireRestaurant(slug);
    const customer = await getStorefrontCustomer(restaurant.id);
    if (!customer) throw errors.unauthorized("Please sign in first.");
    const user = await getUserById(customer.userId);
    if (!user?.email) throw errors.internal("Could not find this account.");
    const identifier = await callerIdentifier();
    await ensureVerificationCode(customer.userId, user.email, identifier, slug);
    return null;
  });
}

export async function verifyEmailCodeAction(slug: string, payload: unknown): Promise<ApiResult<null>> {
  return action(async () => {
    const restaurant = await requireRestaurant(slug);
    const customer = await getStorefrontCustomer(restaurant.id);
    if (!customer) throw errors.unauthorized("Please sign in first.");
    const { code } = verifyCodeSchema.parse(payload);
    await verifyEmailCode(customer.userId, code);
    return null;
  });
}

export async function isSignedInWithVerifiedEmail(slug: string): Promise<{ signedIn: boolean; emailVerified: boolean }> {
  const restaurant = await requireRestaurant(slug);
  const customer = await getStorefrontCustomer(restaurant.id);
  if (!customer) return { signedIn: false, emailVerified: false };
  return { signedIn: true, emailVerified: await isEmailVerified(customer.userId) };
}

// ── Google OAuth (redirect flow; route handlers below call these) ───────────

function googleRedirectUri(slug: string): string {
  return `${config.app.siteUrl}/r/${slug}/account/google/callback`;
}

/** Only ever redirect back into this restaurant's own storefront — never an absolute or cross-tenant URL. */
function sanitizeReturnTo(slug: string, returnTo: string | null): string | null {
  if (!returnTo || (!returnTo.startsWith(`/r/${slug}/`) && returnTo !== `/r/${slug}`)) return null;
  if (returnTo.startsWith("//") || returnTo.includes("://")) return null;
  // Landing back on the sign-in/sign-up page itself while now authenticated is a confusing loop — go to /account instead.
  if (/^\/r\/[^/]+\/account\/(sign-in|sign-up)\/?$/.test(returnTo)) return null;
  return returnTo;
}

export async function beginGoogleSignIn(slug: string, returnTo: string | null): Promise<never> {
  const state = randomUUID();
  await setGoogleState(state);
  const safeReturnTo = sanitizeReturnTo(slug, returnTo);
  if (safeReturnTo) await setGoogleReturnTo(safeReturnTo);
  const url = startGoogleAuth(googleRedirectUri(slug), state);
  redirect(url);
}

export async function handleGoogleCallback(
  slug: string,
  code: string,
  state: string,
): Promise<{ needsPhone: boolean; pendingToken?: string; returnTo: string | null }> {
  const expected = await consumeGoogleState();
  const returnTo = await consumeGoogleReturnTo();
  if (!expected || expected !== state) throw errors.validation("This sign-in link has expired. Please try again.");
  const result = await completeGoogleAuth(slug, code, googleRedirectUri(slug));
  if (result.status === "signed-in") {
    await setCustomerSession(result.token, result.maxAge);
    return { needsPhone: false, returnTo };
  }
  return { needsPhone: true, pendingToken: result.pendingToken, returnTo };
}

export async function finishGoogleSignupAction(payload: { pendingToken: string; phone: string }): Promise<ApiResult<null>> {
  return action(async () => {
    const result = await finishGoogleSignup(payload.pendingToken, payload.phone);
    await setCustomerSession(result.token, result.maxAge);
    return null;
  });
}

export async function getCustomerSessionSummary(slug: string): Promise<{ signedIn: boolean; name: string | null }> {
  const session = await getCustomerSession();
  if (!session) return { signedIn: false, name: null };
  const restaurant = await requireRestaurant(slug);
  const customer = await getStorefrontCustomer(restaurant.id);
  return { signedIn: Boolean(customer), name: customer?.name ?? null };
}
