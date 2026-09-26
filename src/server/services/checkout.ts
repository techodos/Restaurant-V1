import { ORDER_TYPES, type OrderType, type PaymentMethod } from "@/shared/contract/enums";
import type { Restaurant } from "@/shared/contract/models";
import { enabledOrderTypes } from "@/shared/ordering";
import { config, isPaymentProviderConfigured } from "@/server/config";
import type { RequestContext } from "@/server/context";
import { errors } from "@/server/errors";
import { getPaymentProvider, type PaymentIntentResult } from "@/server/integrations/payments";
import { createOrder, getOrderForAccessGrant, setOrderPaymentStatus } from "@/server/repositories/orders";
import type { PlaceOrderInput } from "@/server/validation/checkout";
import { findCart } from "./cart";

/**
 * Guest checkout.
 *
 * The browser sends customer details and choices only: every price, discount,
 * fee, tax figure, availability flag and coupon is recomputed inside
 * `createOrder` from the live database before the order row is written.
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
  input: PlaceOrderInput,
  visitor: RequestContext,
): Promise<PlaceOrderResult> {
  const cartToken = visitor.cartToken ?? "";
  const cartExpired = () => errors.custom("CART_EMPTY", "Your cart has expired. Please add your items again.");
  if (!cartToken) throw cartExpired();

  const cart = await findCart(restaurant, cartToken, visitor.customerId ?? null);
  if (!cart) throw cartExpired();

  if (input.orderType === "delivery" && !input.addressLine1) {
    throw errors.validation("Please add a delivery address.", { field: "addressLine1" });
  }

  const isDineIn = input.orderType === "dine_in";
  const { order, requiresOnlinePayment } = await createOrder(
    {
      restaurantId: restaurant.id,
      cartId: cart.id,
      orderType: input.orderType,
      customer: {
        fullName: input.fullName,
        phone: input.phone,
        email: input.email || null,
      },
      address: isDineIn
        ? null
        : {
            line1: input.addressLine1 || "",
            line2: input.addressLine2 || null,
            area: input.area || null,
            city: input.city || null,
            postalCode: input.postalCode || null,
          },
      deliveryZoneId: input.deliveryZoneId || null,
      tableNumber: input.tableNumber || null,
      guests: input.guests ?? null,
      paymentMethod: input.paymentMethod,
      couponCode: input.couponCode || cart.couponCode,
      tipAmount: input.tipAmount || null,
      notes: input.notes || null,
      customerId: visitor.customerId ?? null,
      userId: visitor.userId ?? null,
      actor: input.fullName,
    },
    { cartToken, customerId: visitor.customerId ?? null },
  );

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
      customer: { name: input.fullName, phone: input.phone, email: input.email || null },
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
export function getCheckoutOptions(restaurant: Restaurant): CheckoutOptions {
  const { features, settings } = restaurant;
  const enabled = settings.payments.enabledMethods.filter((method) => {
    // "wallet" (JazzCash) is gated exactly like "card_online" (Stripe) — both need the restaurant's
    // chosen online provider to actually be configured server-side, or the option would show at
    // checkout and then fail (or worse, silently record an unpaid order as if payment were possible).
    if (method === "card_online" || method === "wallet") {
      return (
        features.onlinePayments &&
        settings.payments.onlineProvider !== "none" &&
        isPaymentProviderConfigured(settings.payments.onlineProvider)
      );
    }
    if (method === "bank_transfer") return features.onlinePayments;
    return true;
  }) as PaymentMethod[];

  return {
    orderTypes: enabledOrderTypes(features, ORDER_TYPES),
    paymentMethods: enabled.length ? enabled : ["cash"],
  };
}
