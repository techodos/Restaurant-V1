import { ORDER_TYPES, type OrderType, type PaymentMethod } from "@/shared/contract/enums";
import type { Restaurant } from "@/shared/contract/models";
import { enabledOrderTypes } from "@/shared/ordering";
import { isPaymentProviderConfigured } from "@/server/config";
import type { RequestContext } from "@/server/context";
import { errors } from "@/server/errors";
import { createOrder } from "@/server/repositories/orders";
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
}

export async function placeOrder(
  restaurant: Restaurant,
  input: PlaceOrderInput,
  visitor: RequestContext,
): Promise<PlaceOrderResult> {
  const cartToken = visitor.cartToken ?? "";
  const cartExpired = () => errors.custom("CART_EMPTY", "Your cart has expired. Please add your items again.");
  if (!cartToken) throw cartExpired();

  const cart = await findCart(restaurant, cartToken);
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

  return { orderNumber: order.orderNumber, requiresOnlinePayment };
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
    if (method === "card_online") {
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
