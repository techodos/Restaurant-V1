import { ORDER_TYPES, PAYMENT_METHOD_ORDER_TYPES, type OrderType, type PaymentMethod } from "@/shared/contract/enums";
import type { Restaurant } from "@/shared/contract/models";
import { enabledOrderTypes } from "@/shared/ordering";
import { config, isPaymentProviderConfigured } from "@/server/config";
import type { RequestContext } from "@/server/context";
import { errors } from "@/server/errors";
import { getPaymentProvider, type PaymentIntentResult } from "@/server/integrations/payments";
import { createOrder, getOrderForAccessGrant, setOrderPaymentStatus } from "@/server/repositories/orders";
import type { PlaceOrderInput } from "@/server/validation/checkout";
import type { Tray } from "@/shared/tray";
import { assertTrayOrderable } from "./cart";

/**
 * Checkout (signed-in, email-verified customers; placeOrderAction enforces that).
 *
 * The browser sends customer details and choices, and its tray cookie names the items: every price,
 * discount, fee, tax figure, availability flag and coupon is recomputed inside `createOrder` — the
 * one database transaction of the whole ordering flow — before the order row is written.
 */

export interface PlaceOrderResult {
  orderNumber: string;
  requiresOnlinePayment: boolean;
  /** Set only when `requiresOnlinePayment`: how the browser gets to the gateway's own page. */
  payment?:
    | { kind: "redirect"; redirectUrl: string } // a plain GET (Stripe Checkout)
    | { kind: "form"; formAction: string; formFields: Record<string, string> }; // a POST-redirect (JazzCash's HCP)
}

export async function placeOrder(
  restaurant: Restaurant,
  tray: Tray,
  input: PlaceOrderInput,
  visitor: RequestContext,
): Promise<PlaceOrderResult> {
  assertTrayOrderable(restaurant, { ...tray, orderType: input.orderType });
  if (input.orderType === "delivery" && !input.addressLine1) {
    throw errors.validation("Please add a delivery address.", { field: "addressLine1" });
  }

  // ONE transaction does everything: the signed-in customer's own row (locked; its saved mobile and
  // email win over the form, a first mobile is stored on it, its email must be verified), every tray
  // line re-priced from the live menu, zone, coupon limits, and the order rows themselves.
  const isDineIn = input.orderType === "dine_in";
  const { order, requiresOnlinePayment, customer } = await createOrder(
    {
      restaurantId: restaurant.id,
      lines: tray.lines,
      locationId: tray.locationId,
      orderType: input.orderType,
      customer: {
        fullName: input.fullName,
        phone: input.phone,
        email: input.email || null,
      },
      accountCustomerId: visitor.customerId ?? null,
      saveAccountPhone: Boolean(visitor.customerId),
      requireVerifiedEmail: Boolean(visitor.customerId),
      address: isDineIn
        ? null
        : {
            line1: input.addressLine1 || "",
            line2: input.addressLine2 || null,
            area: input.area || null,
            city: input.city || null,
            postalCode: input.postalCode || null,
            latitude: input.latitude ?? null,
            longitude: input.longitude ?? null,
          },
      deliveryZoneId: input.deliveryZoneId || null,
      tableNumber: input.tableNumber || null,
      guests: input.guests ?? null,
      paymentMethod: input.paymentMethod,
      // only the code the checkout page showed as applied (it drops one that stopped applying)
      couponCode: input.couponCode || null,
      tipAmount: input.tipAmount || null,
      notes: input.notes || null,
      customerId: visitor.customerId ?? null,
      userId: visitor.userId ?? null,
      actor: input.fullName,
    },
    { customerId: visitor.customerId ?? null },
  );
  const phone = order.customerPhone || input.phone;
  const email = customer.email || input.email || null;

  if (!requiresOnlinePayment) return { orderNumber: order.orderNumber, requiresOnlinePayment };

  // A failed intent must never fail an order that is already committed — the order stays
  // `pending`/unpaid (same as an unpaid cash order) and the customer can retry or contact the
  // restaurant, instead of losing the order they already placed over a gateway hiccup.
  try {
    const provider = getPaymentProvider(input.paymentMethod, restaurant.settings.payments.onlineProvider);
    const intent: PaymentIntentResult = await provider.createIntent({
      restaurantId: restaurant.id,
      orderId: order.id,
      orderNumber: order.orderNumber,
      amount: order.total,
      currency: order.currency,
      method: input.paymentMethod,
      // the same phone / email the order was saved with (the account's own when signed in), not the browser's
      customer: { name: input.fullName, phone, email },
      // provider.id, not the payment method, picks the return path — each gateway's callback route
      returnUrl: `${config.app.siteUrl}/r/${restaurant.slug}/checkout/pay/${provider.id}`,
      cancelUrl: `${config.app.siteUrl}/r/${restaurant.slug}/checkout`,
    });
    if (intent.formAction && intent.formFields) {
      return { orderNumber: order.orderNumber, requiresOnlinePayment, payment: { kind: "form", formAction: intent.formAction, formFields: intent.formFields } };
    }
    if (intent.redirectUrl) {
      return { orderNumber: order.orderNumber, requiresOnlinePayment, payment: { kind: "redirect", redirectUrl: intent.redirectUrl } };
    }
    return { orderNumber: order.orderNumber, requiresOnlinePayment };
  } catch (error) {
    await setOrderPaymentStatus(order.id, "failed", visitor, {
      failureReason: error instanceof Error ? error.message : "Could not start the online payment.",
    }).catch(() => {});
    throw errors.custom(
      "PAYMENT_UNAVAILABLE",
      "Your order was placed, but online payment could not be started. Please contact the restaurant or choose cash.",
    );
  }
}

/**
 * Applies a gateway's verified payment result to an already-placed order — JazzCash's `pp_ReturnURL`
 * callback and Stripe's return route + webhook all call this. Only ever changes `payment_status`/the
 * `payments` row — never `orders.status`, which stays a staff-driven state machine (section 5 rule
 * 4): a successful online payment still waits for staff to `confirm` the order, same as a cash order.
 * Idempotent (a resolved payment is left alone), so both a return-URL confirmation and a later
 * webhook confirmation for the same order — Stripe recommends running both — are safe together.
 */
export async function confirmOnlinePayment(
  restaurantId: string,
  orderNumber: string,
  orderId: string,
  outcome: { success: boolean; transactionId: string | null; failureReason: string | null },
): Promise<void> {
  const ctx: RequestContext = { restaurantId };
  const order = await getOrderForAccessGrant(restaurantId, orderNumber, orderId);
  if (!order) throw errors.notFound("Order");
  if (order.payment && order.payment.status !== "pending") return; // already resolved: idempotent on a retried callback
  await setOrderPaymentStatus(orderId, outcome.success ? "paid" : "failed", ctx, {
    transactionId: outcome.transactionId,
    failureReason: outcome.failureReason,
  });
}

export interface CheckoutOptions {
  orderTypes: OrderType[];
  paymentMethods: PaymentMethod[];
}

/**
 * What the checkout form may offer. Online payment is only listed when the
 * restaurant enabled it AND a provider is configured server-side — a fake
 * successful payment is never recorded.
 */
export function getCheckoutOptions(restaurant: Restaurant, orderType?: OrderType): CheckoutOptions {
  const { features, settings } = restaurant;
  const enabled = settings.payments.enabledMethods.filter((method) => {
    // "wallet" (JazzCash) is gated exactly like "card_online" (Stripe) — both need the restaurant's
    // chosen online provider to actually be configured server-side, or the option would show at
    // checkout and then fail (or worse, silently record an unpaid order as if payment were possible).
    if (method === "card_online" || method === "wallet") {
      if (
        !features.onlinePayments ||
        settings.payments.onlineProvider === "none" ||
        !isPaymentProviderConfigured(settings.payments.onlineProvider)
      ) {
        return false;
      }
    } else if (method === "bank_transfer" && !features.onlinePayments) {
      return false;
    }
    // "Cash on delivery" only makes sense for a delivery order, a terminal/cash-at-counter payment
    // only for pickup/dine-in, etc. — see PAYMENT_METHOD_ORDER_TYPES.
    if (orderType && !PAYMENT_METHOD_ORDER_TYPES[method].includes(orderType)) return false;
    return true;
  }) as PaymentMethod[];

  return {
    orderTypes: enabledOrderTypes(features, ORDER_TYPES),
    paymentMethods: enabled.length ? enabled : ["cash"],
  };
}
