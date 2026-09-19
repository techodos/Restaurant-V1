"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  addItemToCart,
  clearCart,
  removeCartItem,
  setCartCoupon,
  setCartLocation,
  setCartOrderType,
  updateCartItemQuantity,
} from "@/lib/db/carts";
import { getRestaurantBySlug } from "@/lib/db/restaurants";
import { action, errors } from "@/lib/errors";
import type { ApiResult } from "@/lib/contract/api";
import { ORDER_TYPES, type OrderType } from "@/lib/contract/enums";
import { resolveCustomerFromSession } from "@/lib/auth";
import { applyPromoCode, ensureCart } from "@/lib/services/cart";

/**
 * Cart server actions. Every mutation re-validates through the data layer
 * (resolveItemSelection) and reprices from the database; the browser only ever
 * sends ids, quantities and free-text notes.
 */

const addItemSchema = z.object({
  menuItemId: z.string().uuid(),
  variantId: z.string().uuid().nullish(),
  quantity: z.coerce.number().int().min(1).max(99).default(1),
  addons: z
    .array(z.object({ addonId: z.string().uuid(), quantity: z.coerce.number().int().min(1).max(20).default(1) }))
    .max(30)
    .default([]),
  specialInstructions: z.string().trim().max(280).optional(),
  orderType: z.enum(ORDER_TYPES).optional(),
});

async function currentContext(slug: string) {
  const restaurant = await getRestaurantBySlug(slug);
  if (!restaurant) throw errors.notFound("Restaurant");
  const customer = await resolveCustomerFromSession(slug);
  const cart = await ensureCart(restaurant, {}, { customerId: customer?.customerId ?? null });
  return { restaurant, cart };
}

export async function addToCartAction(slug: string, payload: unknown): Promise<ApiResult<{ itemCount: number }>> {
  return action(async () => {
    const input = addItemSchema.parse(payload);
    const { restaurant, cart } = await currentContext(slug);

    if (!restaurant.features.onlineOrdering) {
      throw errors.custom("ORDERING_DISABLED", "Online ordering is paused right now.");
    }

    const orderType = input.orderType ?? cart.orderType;
    if (orderType !== cart.orderType) {
      await setCartOrderType(cart.id, orderType, { cartToken: cart.sessionToken });
    }

    await addItemToCart(
      {
        cartId: cart.id,
        restaurantId: restaurant.id,
        timezone: restaurant.timezone,
        input: {
          menuItemId: input.menuItemId,
          variantId: input.variantId ?? null,
          quantity: input.quantity,
          addons: input.addons,
          specialInstructions: input.specialInstructions ?? null,
        },
      },
      { cartToken: cart.sessionToken },
    );

    revalidatePath(`/r/${slug}`, "layout");
    return { itemCount: cart.itemCount + input.quantity };
  });
}

const quantitySchema = z.object({ cartItemId: z.string().uuid(), quantity: z.coerce.number().int().min(0).max(99) });

export async function updateCartItemAction(slug: string, payload: unknown): Promise<ApiResult<{ updated: true }>> {
  return action(async () => {
    const input = quantitySchema.parse(payload);
    const { cart } = await currentContext(slug);
    if (!cart.items.some((item) => item.id === input.cartItemId)) {
      throw errors.forbidden("That item is not in your cart.");
    }
    await updateCartItemQuantity(
      { cartItemId: input.cartItemId, quantity: input.quantity },
      { cartToken: cart.sessionToken },
    );
    revalidatePath(`/r/${slug}`, "layout");
    return { updated: true as const };
  });
}

export async function removeCartItemAction(slug: string, payload: unknown): Promise<ApiResult<{ updated: true }>> {
  return action(async () => {
    const input = z.object({ cartItemId: z.string().uuid() }).parse(payload);
    const { cart } = await currentContext(slug);
    if (!cart.items.some((item) => item.id === input.cartItemId)) {
      throw errors.forbidden("That item is not in your cart.");
    }
    await removeCartItem(input.cartItemId, { cartToken: cart.sessionToken });
    revalidatePath(`/r/${slug}`, "layout");
    return { updated: true as const };
  });
}

export async function clearCartAction(slug: string): Promise<ApiResult<{ cleared: true }>> {
  return action(async () => {
    const { cart } = await currentContext(slug);
    await clearCart(cart.id, { cartToken: cart.sessionToken });
    revalidatePath(`/r/${slug}`, "layout");
    return { cleared: true as const };
  });
}

const couponSchema = z.object({ code: z.string().trim().max(40) });

export async function applyCouponAction(slug: string, payload: unknown): Promise<ApiResult<{ code: string }>> {
  return action(async () => {
    const input = couponSchema.parse(payload);
    const { restaurant, cart } = await currentContext(slug);
    if (!restaurant.features.coupons) {
      throw errors.custom("ORDERING_DISABLED", "Promo codes are not available here.");
    }
    if (!input.code) {
      await setCartCoupon(cart.id, null, { cartToken: cart.sessionToken });
      revalidatePath(`/r/${slug}`, "layout");
      return { code: "" };
    }

    // validated with the checkout engine before we store it
    const coupon = await applyPromoCode(restaurant, cart, input.code);
    if (!coupon) throw errors.custom("COUPON_INVALID", "That promo code is not valid.");
    await setCartCoupon(cart.id, { id: coupon.id, code: coupon.code }, { cartToken: cart.sessionToken });
    revalidatePath(`/r/${slug}`, "layout");
    return { code: coupon.code };
  });
}

export async function setOrderTypeAction(slug: string, payload: unknown): Promise<ApiResult<{ orderType: OrderType }>> {
  return action(async () => {
    const input = z.object({ orderType: z.enum(ORDER_TYPES) }).parse(payload);
    const { restaurant, cart } = await currentContext(slug);
    const enabled =
      input.orderType === "delivery"
        ? restaurant.features.delivery
        : input.orderType === "pickup"
          ? restaurant.features.pickup
          : restaurant.features.dineIn;
    if (!enabled) throw errors.custom("ORDERING_DISABLED", "That ordering option is currently unavailable.");
    await setCartOrderType(cart.id, input.orderType, { cartToken: cart.sessionToken });
    revalidatePath(`/r/${slug}`, "layout");
    return { orderType: input.orderType };
  });
}

export async function setLocationAction(slug: string, payload: unknown): Promise<ApiResult<{ locationId: string }>> {
  return action(async () => {
    const input = z.object({ locationId: z.string().uuid() }).parse(payload);
    const { cart } = await currentContext(slug);
    await setCartLocation(cart.id, input.locationId, { cartToken: cart.sessionToken });
    revalidatePath(`/r/${slug}`, "layout");
    return { locationId: input.locationId };
  });
}
