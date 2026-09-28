'use server';

import { revalidatePath } from 'next/cache';
import type { ApiResult } from '@/shared/contract/api';
import type { OrderType } from '@/shared/contract/enums';
import { action } from '@/server/errors';
import {
  addToCart,
  applyCoupon,
  changeCartLocation,
  changeOrderType,
  emptyCart,
  removeFromCart,
  updateCartItem,
} from '@/server/services/cart';
import {
  addToCartSchema,
  applyCouponSchema,
  removeCartItemSchema,
  setCartLocationSchema,
  setOrderTypeSchema,
  updateCartItemSchema,
} from '@/server/validation/cart';
import { setCartCountHint } from '@/web/session';
import { openStorefrontCart } from '@/web/storefront';

/**
 * Cart server actions: parse input, delegate to the cart service, refresh the
 * storefront. The browser only ever sends ids, quantities and free-text notes;
 * every mutation is re-validated and repriced from the database.
 */

function refreshStorefront(slug: string): void {
  revalidatePath(`/r/${slug}`, 'layout');
}

/**
 * The header badge is a cookie hint, only kept current by cart *actions* — merely
 * viewing the cart page never resyncs it. Called from the cart page (which already
 * loaded the real cart) so a hint that drifted stale (e.g. an add-to-cart that
 * failed after the hint was optimistically set) self-heals on the next visit
 * instead of showing a wrong badge indefinitely.
 */
export async function resyncCartCountAction(count: number): Promise<void> {
  await setCartCountHint(count);
}

export async function addToCartAction(
  slug: string,
  payload: unknown,
): Promise<ApiResult<{ itemCount: number }>> {
  return action(async () => {
    const input = addToCartSchema.parse(payload);
    const { restaurant, cart } = await openStorefrontCart(slug);
    const result = await addToCart(restaurant, cart, input);
    await setCartCountHint(result.itemCount);
    refreshStorefront(slug);
    return result;
  });
}

export async function updateCartItemAction(
  slug: string,
  payload: unknown,
): Promise<ApiResult<{ updated: true }>> {
  return action(async () => {
    const input = updateCartItemSchema.parse(payload);
    const { cart } = await openStorefrontCart(slug);
    const { itemCount } = await updateCartItem(cart, input);
    await setCartCountHint(itemCount);
    refreshStorefront(slug);
    return { updated: true as const };
  });
}

export async function removeCartItemAction(
  slug: string,
  payload: unknown,
): Promise<ApiResult<{ updated: true }>> {
  return action(async () => {
    const input = removeCartItemSchema.parse(payload);
    const { cart } = await openStorefrontCart(slug);
    const { itemCount } = await removeFromCart(cart, input.cartItemId);
    await setCartCountHint(itemCount);
    refreshStorefront(slug);
    return { updated: true as const };
  });
}

export async function clearCartAction(
  slug: string,
): Promise<ApiResult<{ cleared: true }>> {
  return action(async () => {
    const { cart } = await openStorefrontCart(slug);
    const { itemCount } = await emptyCart(cart);
    await setCartCountHint(itemCount);
    refreshStorefront(slug);
    return { cleared: true as const };
  });
}

export async function applyCouponAction(
  slug: string,
  payload: unknown,
): Promise<ApiResult<{ code: string }>> {
  return action(async () => {
    const input = applyCouponSchema.parse(payload);
    const { restaurant, cart } = await openStorefrontCart(slug);
    const code = await applyCoupon(restaurant, cart, input.code);
    refreshStorefront(slug);
    return { code };
  });
}

export async function setOrderTypeAction(
  slug: string,
  payload: unknown,
): Promise<ApiResult<{ orderType: OrderType }>> {  return action(async () => {
    const input = setOrderTypeSchema.parse(payload);
    const { restaurant, cart } = await openStorefrontCart(slug);
    await changeOrderType(restaurant, cart, input.orderType);
    refreshStorefront(slug);
    return { orderType: input.orderType };
  });
}

export async function setLocationAction(
  slug: string,
  payload: unknown,
): Promise<ApiResult<{ locationId: string }>> {
  return action(async () => {
    const input = setCartLocationSchema.parse(payload);
    const { cart } = await openStorefrontCart(slug);
    await changeCartLocation(cart, input.locationId);
    refreshStorefront(slug);
    return { locationId: input.locationId };
  });
}
