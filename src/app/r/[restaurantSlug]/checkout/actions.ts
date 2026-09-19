"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { PAYMENT_METHODS, ORDER_TYPES } from "@/lib/contract/enums";
import type { ApiResult } from "@/lib/contract/api";
import { createOrder } from "@/lib/db/orders";
import { getRestaurantBySlug } from "@/lib/db/restaurants";
import { CART_COOKIE } from "@/lib/auth/session";
import { resolveCustomerFromSession } from "@/lib/auth";
import { action, errors } from "@/lib/errors";
import { readCart } from "@/lib/services/cart";

/**
 * Guest checkout.
 *
 * The browser sends customer details and choices only: every price, discount,
 * fee, tax figure, availability flag and coupon is recomputed inside
 * `createOrder` from the live database before the order row is written.
 */

const checkoutSchema = z.object({
  orderType: z.enum(ORDER_TYPES),
  fullName: z.string().trim().min(2, "Please enter your name.").max(120),
  phone: z
    .string()
    .trim()
    .min(7, "Please enter a contact number.")
    .max(24)
    .regex(/^[+0-9()\s-]+$/, "Please enter a valid phone number."),
  email: z.string().trim().email("That email address looks incomplete.").max(160).optional().or(z.literal("")),
  addressLine1: z.string().trim().max(200).optional().or(z.literal("")),
  addressLine2: z.string().trim().max(200).optional().or(z.literal("")),
  area: z.string().trim().max(120).optional().or(z.literal("")),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  postalCode: z.string().trim().max(20).optional().or(z.literal("")),
  deliveryZoneId: z.string().uuid().optional().or(z.literal("")),
  tableNumber: z.string().trim().max(20).optional().or(z.literal("")),
  guests: z.coerce.number().int().min(1).max(60).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  couponCode: z.string().trim().max(40).optional().or(z.literal("")),
  tipAmount: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, "Enter a tip amount like 150 or 150.50")
    .optional()
    .or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export interface PlaceOrderResult {
  orderNumber: string;
  requiresOnlinePayment: boolean;
}

export async function placeOrderAction(slug: string, payload: unknown): Promise<ApiResult<PlaceOrderResult>> {
  return action(async () => {
    const input = checkoutSchema.parse(payload);

    const restaurant = await getRestaurantBySlug(slug);
    if (!restaurant) throw errors.notFound("Restaurant");

    const store = await cookies();
    const cartToken = store.get(CART_COOKIE)?.value ?? "";
    if (!cartToken) throw errors.custom("CART_EMPTY", "Your cart has expired. Please add your items again.");

    const cart = await readCart(restaurant, { cartToken });
    if (!cart) throw errors.custom("CART_EMPTY", "Your cart has expired. Please add your items again.");

    if (input.orderType === "delivery" && !input.addressLine1) {
      throw errors.validation("Please add a delivery address.", { field: "addressLine1" });
    }

    const customer = await resolveCustomerFromSession(slug);
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
        customerId: customer?.customerId ?? null,
        userId: customer?.userId ?? null,
        actor: input.fullName,
      },
      { cartToken, customerId: customer?.customerId ?? null },
    );

    revalidatePath(`/r/${slug}`, "layout");
    return { orderNumber: order.orderNumber, requiresOnlinePayment };
  });
}
