import { cache } from "react";
import { notFound } from "next/navigation";
import type { Cart, Restaurant, StorefrontContext } from "@/shared/contract/models";
import { AppError } from "@/server/errors";
import { findCart, generateCartToken, openCart } from "@/server/services/cart";
import { requireRestaurant } from "@/server/services/restaurants";
import { loadStorefrontContext } from "@/server/services/storefront";
import { getCartToken, getStorefrontCustomer, setCartCountHint, setCartToken } from "./session";

/**
 * Next.js glue for the storefront: request-scoped caching, `notFound()`, and
 * the cart cookie. The logic itself lives in server/services.
 */

/** Cached per request so layout, page and sections share one lookup. */
export const getStorefrontContext = cache(loadStorefrontContext);

/**
 * Renders a 404 only when the restaurant genuinely does not exist. Infrastructure
 * failures (database down) propagate to the error boundary instead of masquerading
 * as "not found".
 */
export async function requireStorefront(slug: string): Promise<StorefrontContext> {
  try {
    return await getStorefrontContext(slug);
  } catch (error) {
    if (error instanceof AppError && error.code === "NOT_FOUND") notFound();
    throw error;
  }
}

/** Read-only: a request that only renders must never mint a cart cookie. */
export async function readCart(restaurant: Restaurant): Promise<Cart | null> {
  const token = await getCartToken();
  if (!token) return null;
  const customer = await getStorefrontCustomer(restaurant.id);
  return findCart(restaurant, token, customer?.customerId ?? null);
}

/**
 * Loads the visitor's cart, creating it (and the cookie) when needed.
 * Only valid in Server Actions and Route Handlers, where cookies are writable.
 */
export async function openStorefrontCart(slug: string): Promise<{ restaurant: Restaurant; cart: Cart }> {
  const restaurant = await requireRestaurant(slug);
  const customer = await getStorefrontCustomer(restaurant.id);

  let token = await getCartToken();
  if (!token) {
    token = generateCartToken();
    await setCartToken(token);
  }
  const cart = await openCart(restaurant, token, { customerId: customer?.customerId ?? null });
  if (cart.sessionToken !== token) {
    token = cart.sessionToken; // the old token was held by a cart this visitor cannot use
    await setCartToken(token);
  }
  // the real cart was just loaded: re-sync the header badge so it cannot stay wrong
  await setCartCountHint(cart.itemCount);
  return { restaurant, cart };
}
