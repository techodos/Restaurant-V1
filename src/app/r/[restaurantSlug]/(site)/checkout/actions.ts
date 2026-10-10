"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { ApiResult } from "@/shared/contract/api";
import { action } from "@/server/errors";
import { placeOrder, type PlaceOrderResult } from "@/server/services/checkout";
import { dispatchDueNotifications } from "@/server/services/notifications";
import {
  checkGuestContact,
  resendGuestVerificationCode,
  sendGuestVerificationCode,
  signUpCustomer,
  verifyGuestCode,
} from "@/server/services/customer-auth";
import { rememberCheckoutAddress } from "@/server/services/customer-profile";
import { guestContactCheckSchema, guestContactSchema, guestVerifyCodeSchema, placeOrderSchema } from "@/server/validation/checkout";
import { signUpSchema } from "@/server/validation/customer-auth";
import { callerIdentifier, getVisitorContext, refreshCustomerSession, rememberGuestOrder, setCustomerSession } from "@/web/session";
import { clearTray, readTray, requireStorefront, requireStorefrontRestaurant } from "@/web/storefront";

export type { PlaceOrderResult };

/**
 * Checkout for a signed-in account or a guest who verified the checkout email via the OTP modal —
 * the ONE database transaction of the whole ordering flow. Restaurant (snapshot), customer (signed
 * session cookie, when there is one) and tray (its own cookie) cost nothing to read; `placeOrder` →
 * `createOrder` then re-reads everything that decides money or permission (restaurant settings, the
 * customer's verification, the menu, zones, coupon) inside that transaction — email verification is
 * enforced there (`requireVerifiedEmail`), never trusted from the browser.
 */
export async function placeOrderAction(slug: string, payload: unknown): Promise<ApiResult<PlaceOrderResult>> {
  return action(async () => {
    const input = placeOrderSchema.parse(payload);
    const context = await requireStorefront(slug);
    const { restaurant } = context;
    const visitor = await getVisitorContext(restaurant.id);
    const tray = await readTray(context);
    // a guest's browser keeps a signed grant for the order, so the order page and "Current orders" can show it
    const result = await placeOrder(restaurant, tray, input, visitor, { rememberGuestOrder });
    await clearTray(slug); // the order consumed the tray
    revalidatePath(`/r/${slug}`, "layout");

    // The order is committed (and its "placed" event queued by the database). No email goes out
    // for a placed order; the confirmation email is sent when staff confirm it. Draining the
    // outbox here just closes the "placed" event after the response; it never affects the result.
    after(() => dispatchDueNotifications({ restaurantId: restaurant.id }, { restaurantId: restaurant.id }));
    // "Save this address for next time": after the response, outside the order transaction; never fails the order
    if (input.saveAddressAs) after(() => rememberCheckoutAddress(restaurant, visitor, input));
    return result;
  });
}

// ── Guest checkout OTP (the "Place order" modal) ──────────────────────────────────────────────────
// Reuses the same email-OTP system as account sign-up/sign-in (server/services/customer-auth.ts) and
// the same guest row every guest order already upserts by phone (repositories/customers.ts). A guest
// proves their checkout email the same way an account proves its login email: verifying marks
// `customers.is_email_verified` on that phone-keyed row, and `createOrder` re-checks it when the order
// is actually placed — the client's "verified" state here is only what opens/closes the modal.

/** Whether the typed phone / email already belongs to a real (non-guest) account here — the form asks them to sign in. */
export async function checkGuestContactAction(
  slug: string,
  payload: unknown,
): Promise<ApiResult<{ phoneTaken: boolean; emailTaken: boolean }>> {
  return action(async () => {
    const input = guestContactCheckSchema.parse(payload);
    const restaurant = await requireStorefrontRestaurant(slug);
    return checkGuestContact(restaurant, input, await callerIdentifier());
  });
}

/** Upserts the guest row (never over a real account's phone) and sends a code only if none is active. */
export async function sendGuestVerificationCodeAction(slug: string, payload: unknown): Promise<ApiResult<null>> {
  return action(async () => {
    const input = guestContactSchema.parse(payload);
    const restaurant = await requireStorefrontRestaurant(slug);
    const identifier = await callerIdentifier();
    await sendGuestVerificationCode(restaurant, input, identifier);
    return null;
  });
}

/** The modal's explicit "Resend code" — always a fresh code, mirrors `sendVerificationCodeAction` vs `ensureVerificationCodeAction`. */
export async function resendGuestVerificationCodeAction(slug: string, payload: unknown): Promise<ApiResult<null>> {
  return action(async () => {
    const input = guestContactSchema.parse(payload);
    const restaurant = await requireStorefrontRestaurant(slug);
    const identifier = await callerIdentifier();
    await resendGuestVerificationCode(restaurant, input, identifier);
    return null;
  });
}

export async function verifyGuestCodeAction(slug: string, payload: unknown): Promise<ApiResult<null>> {
  return action(async () => {
    const input = guestVerifyCodeSchema.parse(payload);
    const restaurant = await requireStorefrontRestaurant(slug);
    await verifyGuestCode(restaurant, input);
    return null;
  });
}

/**
 * "Save your details?" → yes: turns the already-verified guest row into a real signed-in account.
 * `signUpCustomer` (the exact function normal sign-up uses) already upgrades a same-phone guest row
 * instead of erroring (auth-service.ts#createCustomerAccount, `on conflict ... where customers.is_guest`)
 * — nothing new here but the password step and signing the browser in immediately.
 */
export async function registerAsAccountAction(slug: string, payload: unknown): Promise<ApiResult<null>> {
  return action(async () => {
    const input = signUpSchema.parse(payload);
    const identifier = await callerIdentifier();
    const restaurant = await requireStorefrontRestaurant(slug);
    const result = await signUpCustomer(restaurant, input, identifier);
    await setCustomerSession(result.token, result.maxAge);
    // The OTP step already proved this email; `signUpCustomer` signs a fresh session claiming
    // `emailVerified: false` (correct for an ordinary signup, wrong here) — correct the claim to match
    // the database row, which `createCustomerAccount`'s upgrade path leaves untouched (already true).
    await refreshCustomerSession({ emailVerified: true });
    return null;
  });
}
