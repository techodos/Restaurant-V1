import type { Cart, CartItem, Coupon, DeliveryZone, OpeningHours, Restaurant, RestaurantLocation } from "@/shared/contract/models";
import { DAY_KEYS, type OrderType } from "@/shared/contract/enums";
import { isOrderTypeEnabled } from "@/shared/ordering";
import { isOpenAt, timeToMinutes, to12Hour, zonedNow } from "@/shared/hours";
import { forRestaurant, type RequestContext } from "@/server/context";
import { errors } from "@/server/errors";
import {
  addItemToCart,
  clearCart,
  getCartByToken,
  getOrCreateCart,
  removeCartItem,
  setCartCoupon,
  setCartLocation,
  setCartOrderType,
  updateCartItemQuantity,
} from "@/server/repositories/carts";
import { getCouponByCode, getCouponById, toCouponPricing } from "@/server/repositories/coupons";
import { matchDeliveryZone } from "@/server/repositories/deliveries";
import { PricingError, tryCalculatePricing, type PricingResult, type ZonePricing } from "@/server/domain/pricing";
import type { AddToCartInput, UpdateCartItemInput } from "@/server/validation/cart";
import { getLiveDeliveryZones } from "./restaurants";

/**
 * Cart use cases. The opaque cart token is the guest identity; where it is
 * stored (cookie today) is the delivery layer's concern. Every price shown to a
 * customer is computed by the same engine checkout uses.
 */

const TOKEN_BYTES = 24;
const MAX_LINE_QUANTITY = 99;

export function generateCartToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Cart requests authorise with the cart token for guests. A signed-in customer's
 * cart also carries `customer_id` (set by `openCart`), and `cart_is_owned`'s RLS
 * check (0005) requires `app.current_customer_id()` to match it in that case — the
 * token alone stops satisfying either branch of that check once a cart is linked
 * to a customer, so `customerId` must be threaded through here too.
 */
function cartContext(restaurantId: string, cartToken: string, customerId?: string | null): RequestContext {
  return forRestaurant(restaurantId, { cartToken, customerId: customerId ?? null });
}

/** Read-only cart lookup (never creates anything). */
export function findCart(restaurant: Restaurant, token: string, customerId?: string | null): Promise<Cart | null> {
  return getCartByToken(restaurant.id, token, cartContext(restaurant.id, token, customerId));
}

/**
 * Loads the active cart for a token, creating it when needed. The lookup runs as the signed-in customer:
 * once a cart is linked to a customer, RLS hides it from a lookup that does not carry their id, which made
 * every add after the first look like "no cart yet" and collide with the cart it could not see.
 *
 * When the token is held by a cart this visitor cannot read (another account's, or another restaurant's),
 * a fresh cart is started under a new token. The caller compares `cart.sessionToken` with the token it
 * passed and stores the new one in the cookie.
 */
export async function openCart(
  restaurant: Restaurant,
  token: string,
  options: { customerId?: string | null; locationId?: string | null } = {},
): Promise<Cart> {
  const open = (cartToken: string) =>
    getOrCreateCart(
      {
        restaurantId: restaurant.id,
        cartToken,
        currency: restaurant.currency,
        customerId: options.customerId ?? null,
        locationId: options.locationId ?? null,
      },
      cartContext(restaurant.id, cartToken, options.customerId),
    );
  try {
    return await open(token);
  } catch (error) {
    if ((error as { code?: string }).code !== "CART_TOKEN_TAKEN") throw error;
    return open(generateCartToken());
  }
}

// ─── mutations ───────────────────────────────────────────────────────────────

export async function addToCart(restaurant: Restaurant, cart: Cart, input: AddToCartInput): Promise<{ itemCount: number }> {
  if (!restaurant.features.onlineOrdering) {
    throw errors.custom("ORDERING_DISABLED", "Online ordering is paused right now.");
  }

  const ctx = cartContext(restaurant.id, cart.sessionToken, cart.customerId);
  const orderType = input.orderType ?? cart.orderType;
  if (orderType !== cart.orderType) {
    await setCartOrderType(cart.id, orderType, ctx);
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
    ctx,
  );
  return { itemCount: cart.itemCount + input.quantity };
}

function requireLine(cart: Cart, cartItemId: string): CartItem {
  const line = cart.items.find((item) => item.id === cartItemId);
  if (!line) throw errors.forbidden("That item is not in your cart.");
  return line;
}

/** Mutations that change quantities report the cart's new size, so callers need not reload it. */
export async function updateCartItem(cart: Cart, input: UpdateCartItemInput): Promise<{ itemCount: number }> {
  const line = requireLine(cart, input.cartItemId);
  await updateCartItemQuantity(
    { cartItemId: input.cartItemId, quantity: input.quantity },
    cartContext(cart.restaurantId, cart.sessionToken, cart.customerId),
  );
  // the repository caps a line at 99 and treats 0 as removal
  const newQuantity = Math.min(Math.max(input.quantity, 0), MAX_LINE_QUANTITY);
  return { itemCount: Math.max(0, cart.itemCount - line.quantity + newQuantity) };
}

export async function removeFromCart(cart: Cart, cartItemId: string): Promise<{ itemCount: number }> {
  const line = requireLine(cart, cartItemId);
  await removeCartItem(cartItemId, cartContext(cart.restaurantId, cart.sessionToken, cart.customerId));
  return { itemCount: Math.max(0, cart.itemCount - line.quantity) };
}

export async function emptyCart(cart: Cart): Promise<{ itemCount: number }> {
  await clearCart(cart.id, cartContext(cart.restaurantId, cart.sessionToken, cart.customerId));
  return { itemCount: 0 };
}

/** Applies (or, with an empty code, removes) a promo code; returns the stored code. */
export async function applyCoupon(restaurant: Restaurant, cart: Cart, code: string): Promise<string> {
  if (!restaurant.features.coupons) {
    throw errors.custom("ORDERING_DISABLED", "Promo codes are not available here.");
  }
  const ctx = cartContext(restaurant.id, cart.sessionToken, cart.customerId);
  if (!code) {
    await setCartCoupon(cart.id, null, ctx);
    return "";
  }

  // validated with the checkout engine before we store it
  const coupon = await validatePromoCode(restaurant, cart, code);
  if (!coupon) throw errors.custom("COUPON_INVALID", "That promo code is not valid.");
  await setCartCoupon(cart.id, { id: coupon.id, code: coupon.code }, ctx);
  return coupon.code;
}

export async function changeOrderType(restaurant: Restaurant, cart: Cart, orderType: OrderType): Promise<void> {
  if (!isOrderTypeEnabled(restaurant.features, orderType)) {
    throw errors.custom("ORDERING_DISABLED", "That ordering option is currently unavailable.");
  }
  await setCartOrderType(cart.id, orderType, cartContext(restaurant.id, cart.sessionToken, cart.customerId));
}

export async function changeCartLocation(cart: Cart, locationId: string): Promise<void> {
  await setCartLocation(cart.id, locationId, cartContext(cart.restaurantId, cart.sessionToken, cart.customerId));
}

// ─── pricing ─────────────────────────────────────────────────────────────────

export interface CartPricingResult {
  pricing: PricingResult | null;
  zone: ZonePricing | null;
  coupon: Coupon | null;
  /** human-readable reasons the cart cannot be checked out yet */
  blockers: string[];
}

function toPricingLines(cart: Cart) {
  return cart.items.map((item) => ({
    unitPrice: item.unitPrice,
    addonsTotal: item.addonsTotal,
    quantity: item.quantity,
  }));
}

function toZonePricing(zone: DeliveryZone): ZonePricing {
  return {
    id: zone.id,
    name: zone.name,
    deliveryFee: zone.deliveryFee,
    minOrderAmount: zone.minOrderAmount,
    freeDeliveryOver: zone.freeDeliveryOver,
    etaMinMinutes: zone.etaMinMinutes,
    etaMaxMinutes: zone.etaMaxMinutes,
  };
}

/** The zone a cart is priced against: matched by address when known, else the cart's own. */
async function resolveCartZone(
  restaurant: Restaurant,
  cart: Cart,
  address?: { area?: string | null; city?: string | null; postalCode?: string | null } | null,
): Promise<ZonePricing | null> {
  // pricing input: always the live database, never the storefront snapshot
  const zones = await getLiveDeliveryZones(restaurant.id, {
    locationId: cart.locationId ?? undefined,
    activeOnly: true,
  });
  const matched = address
    ? matchDeliveryZone(zones, address)
    : (zones.find((candidate) => candidate.id === cart.locationId) ?? zones[0] ?? null);
  return matched ? toZonePricing(matched) : null;
}

/** Coupons are privileged data: read them on the server connection so guests still see their own discount. */
async function loadCartCoupon(restaurant: Restaurant, cart: Cart): Promise<Coupon | null> {
  const ctx = forRestaurant(restaurant.id);
  if (cart.couponId) return getCouponById(cart.couponId, ctx);
  if (cart.couponCode) return getCouponByCode(restaurant.id, cart.couponCode, ctx);
  return null;
}

/**
 * Prices a cart for display: same engine as checkout, but validation failures
 * become messages instead of exceptions so the cart page can stay usable.
 */
export async function priceCart(
  restaurant: Restaurant,
  cart: Cart,
  options: {
    orderType?: OrderType;
    address?: { area?: string | null; city?: string | null; postalCode?: string | null } | null;
  } = {},
): Promise<CartPricingResult> {
  const orderType = options.orderType ?? cart.orderType;
  const zone = orderType === "delivery" ? await resolveCartZone(restaurant, cart, options.address) : null;
  const coupon = await loadCartCoupon(restaurant, cart);

  const result = tryCalculatePricing({
    lines: toPricingLines(cart),
    orderType,
    settings: restaurant.settings,
    zone,
    coupon: coupon ? toCouponPricing(coupon) : null,
  });

  if (!result.ok) {
    return { pricing: null, zone, coupon, blockers: [result.error.message] };
  }
  return { pricing: result.pricing, zone, coupon, blockers: [] };
}

/**
 * Validates a promo code for this cart. Runs server-side (coupons are not
 * readable from the storefront role) and throws a PricingError when the code
 * would not work at checkout.
 */
export async function validatePromoCode(restaurant: Restaurant, cart: Cart, code: string): Promise<Coupon | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;

  const coupon = await getCouponByCode(restaurant.id, trimmed, forRestaurant(restaurant.id));
  if (!coupon || !coupon.isActive) {
    throw new PricingError("COUPON_INVALID", "That promo code is not valid.");
  }

  const zone = cart.orderType === "delivery" ? await resolveCartZone(restaurant, cart, null) : null;

  // Reuse the checkout rules so a code that works here always works at checkout.
  tryCalculatePricing({
    lines: toPricingLines(cart),
    orderType: cart.orderType,
    settings: restaurant.settings,
    zone,
    coupon: toCouponPricing(coupon),
  });

  return coupon;
}

// ─── availability ────────────────────────────────────────────────────────────

export interface ServiceAvailability {
  isOpen: boolean;
  opensAt: string | null;
  message: string;
  acceptsOrders: boolean;
}

const closed = (message: string, opensAt: string | null = null): ServiceAvailability => ({
  isOpen: false,
  opensAt,
  message,
  acceptsOrders: false,
});

/** Whether the kitchen is taking orders right now, from hours + features. */
export function serviceAvailability(
  restaurant: Restaurant,
  location: RestaurantLocation | null,
  orderType: OrderType,
  now = new Date(),
): ServiceAvailability {
  const features = restaurant.features;
  if (restaurant.status !== "active") return closed("This restaurant is not accepting orders right now.");
  if (!features.onlineOrdering) return closed("Online ordering is currently paused.");
  if (!isOrderTypeEnabled(features, orderType)) return closed("That ordering option is currently unavailable.");

  const hours: OpeningHours = location?.hours ?? {};
  if (!isOpenAt(hours, now, restaurant.timezone)) {
    const reopening = nextOpeningTime(hours, now, restaurant.timezone);
    return closed(
      reopening
        ? `The kitchen is closed right now — we open again at ${to12Hour(reopening)}.`
        : "The kitchen is closed right now — browse the menu and order when we open.",
      reopening,
    );
  }
  return { isOpen: true, opensAt: null, message: "", acceptsOrders: true };
}

/**
 * The next time the kitchen opens, as "HH:MM" in the restaurant's timezone.
 * Looks at the remainder of today first, then the next six days.
 */
function nextOpeningTime(hours: OpeningHours, now: Date, timezone: string): string | null {
  const zoned = zonedNow(now, timezone);
  const startIndex = DAY_KEYS.indexOf(zoned.dayKey);
  if (startIndex === -1) return null;

  for (let offset = 0; offset < DAY_KEYS.length; offset += 1) {
    const key = DAY_KEYS[(startIndex + offset) % DAY_KEYS.length];
    const windows = (key ? hours[key] : undefined) ?? [];
    for (const window of windows) {
      const minutes = timeToMinutes(window.open);
      // an overnight window that already started today is not "upcoming"
      if (offset === 0 && minutes <= zoned.minutes) continue;
      return window.open;
    }
  }
  return null;
}
