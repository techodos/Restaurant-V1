import { cookies } from "next/headers";
import { CART_COOKIE } from "../auth/session";
import type { Cart, Restaurant, RestaurantLocation, Coupon, OpeningHours } from "../contract/models";
import { DAY_KEYS, type OrderType } from "../contract/enums";
import { getCartByToken, getOrCreateCart } from "../db/carts";
import { getCouponById, getCouponByCode, toCouponPricing } from "../db/coupons";
import { listDeliveryZones, matchDeliveryZone } from "../db/deliveries";
import type { RequestContext } from "../db/pool";
import { isOpenAt, timeToMinutes, zonedNow } from "../hours";
import { PricingError, type PricingResult, type ZonePricing, cartSubtotal, tryCalculatePricing } from "../pricing";

/**
 * Storefront cart plumbing: the opaque cart cookie is the guest identity, and
 * every price shown to a customer is computed by the same engine checkout uses.
 */

const TOKEN_BYTES = 24;

function randomToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const CART_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 120,
};

/** Reads the guest cart token, creating one when the visitor is new. */
export async function getCartToken(): Promise<string> {
  const store = await cookies();
  return store.get(CART_COOKIE)?.value ?? "";
}

/**
 * Loads the active cart, creating it (and the cookie) when needed.
 * Must run in a Server Action or Route Handler to be able to set cookies.
 */
export async function ensureCart(
  restaurant: Restaurant,
  ctx: RequestContext,
  options: { customerId?: string | null; locationId?: string | null } = {},
): Promise<Cart> {
  const store = await cookies();
  let token = store.get(CART_COOKIE)?.value;
  if (!token) {
    token = randomToken();
    store.set(CART_COOKIE, token, CART_COOKIE_OPTIONS);
  }
  return getOrCreateCart(
    {
      restaurantId: restaurant.id,
      cartToken: token,
      currency: restaurant.currency,
      customerId: options.customerId ?? null,
      locationId: options.locationId ?? null,
    },
    { ...ctx, cartToken: token },
  );
}

/** Read-only cart lookup for server components (never sets cookies). */
export async function readCart(restaurant: Restaurant, ctx: RequestContext): Promise<Cart | null> {
  const token = await getCartToken();
  if (!token) return null;
  return getCartByToken(restaurant.id, token, { ...ctx, cartToken: token });
}

export interface CartPricingResult {
  pricing: PricingResult | null;
  zone: ZonePricing | null;
  coupon: Coupon | null;
  /** human-readable reasons the cart cannot be checked out yet */
  blockers: string[];
}

/**
 * Prices a cart for display: same engine as checkout, but validation failures
 * become messages instead of exceptions so the cart page can stay usable.
 */
export async function priceCart(
  restaurant: Restaurant,
  cart: Cart,
  options: { orderType?: OrderType; address?: { area?: string | null; city?: string | null; postalCode?: string | null } | null } = {},
  ctx: RequestContext = {},
): Promise<CartPricingResult> {
  const orderType = options.orderType ?? cart.orderType;

  let zone: ZonePricing | null = null;
  if (orderType === "delivery") {
    const zones = await listDeliveryZones(restaurant.id, ctx, {
      locationId: cart.locationId ?? undefined,
      activeOnly: true,
    });
    const matched = options.address
      ? matchDeliveryZone(zones, options.address)
      : zones.find((candidate) => candidate.id === cart.locationId) ?? zones[0] ?? null;
    if (matched) {
      zone = {
        id: matched.id,
        name: matched.name,
        deliveryFee: matched.deliveryFee,
        minOrderAmount: matched.minOrderAmount,
        freeDeliveryOver: matched.freeDeliveryOver,
        etaMinMinutes: matched.etaMinMinutes,
        etaMaxMinutes: matched.etaMaxMinutes,
      };
    }
  }

  // Coupons are privileged data: read them on the server connection so guests
  // still see the discount on their own cart without any coupon leak.
  const coupon = cart.couponId
    ? await getCouponById(cart.couponId, ctx)
    : cart.couponCode
      ? await getCouponByCode(restaurant.id, cart.couponCode, ctx)
      : null;

  const result = tryCalculatePricing({
    lines: cart.items.map((item) => ({
      unitPrice: item.unitPrice,
      addonsTotal: item.addonsTotal,
      quantity: item.quantity,
    })),
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
 * Validates a promo code for this cart and records it.
 * Runs server-side (coupons are not readable from the storefront role) and
 * returns the discount the customer can expect, or throws a PricingError.
 */
export async function applyPromoCode(
  restaurant: Restaurant,
  cart: Cart,
  code: string,
  ctx: RequestContext = {},
): Promise<Coupon | null> {
  const trimmed = code.trim();
  if (!trimmed) return null;

  const coupon = await getCouponByCode(restaurant.id, trimmed, ctx);
  if (!coupon || !coupon.isActive) {
    throw new PricingError("COUPON_INVALID", "That promo code is not valid.");
  }

  const subtotal = cartSubtotal(
    cart.items.map((item) => ({ unitPrice: item.unitPrice, addonsTotal: item.addonsTotal, quantity: item.quantity })),
  );
  let zone: ZonePricing | null = null;
  if (cart.orderType === "delivery") {
    const zones = await listDeliveryZones(restaurant.id, ctx, {
      locationId: cart.locationId ?? undefined,
      activeOnly: true,
    });
    const matched = zones.find((candidate) => candidate.id === cart.locationId) ?? zones[0] ?? null;
    zone = matched
      ? {
          id: matched.id,
          name: matched.name,
          deliveryFee: matched.deliveryFee,
          minOrderAmount: matched.minOrderAmount,
          freeDeliveryOver: matched.freeDeliveryOver,
        }
      : null;
  }

  // Reuse the checkout rules so a code that works here always works at checkout.
  tryCalculatePricing({
    lines: cart.items.map((item) => ({
      unitPrice: item.unitPrice,
      addonsTotal: item.addonsTotal,
      quantity: item.quantity,
    })),
    orderType: cart.orderType,
    settings: restaurant.settings,
    zone,
    coupon: toCouponPricing(coupon),
  });
  void subtotal;

  return coupon;
}

export interface ServiceAvailability {
  isOpen: boolean;
  opensAt: string | null;
  message: string;
  acceptsOrders: boolean;
}

/** Whether the kitchen is taking orders right now, from hours + features. */
export function serviceAvailability(
  restaurant: Restaurant,
  location: RestaurantLocation | null,
  orderType: OrderType,
  now = new Date(),
): ServiceAvailability {
  const features = restaurant.features;
  if (restaurant.status !== "active") {
    return { isOpen: false, opensAt: null, message: "This restaurant is not accepting orders right now.", acceptsOrders: false };
  }
  if (!features.onlineOrdering) {
    return { isOpen: false, opensAt: null, message: "Online ordering is currently paused.", acceptsOrders: false };
  }
  const orderTypeEnabled =
    orderType === "delivery" ? features.delivery : orderType === "pickup" ? features.pickup : features.dineIn;
  if (!orderTypeEnabled) {
    return { isOpen: false, opensAt: null, message: "That ordering option is currently unavailable.", acceptsOrders: false };
  }
  const hours: OpeningHours = location?.hours ?? {};
  if (!isOpenAt(hours, now, restaurant.timezone)) {
    const reopening = nextOpeningTime(hours, now, restaurant.timezone);
    return {
      isOpen: false,
      opensAt: reopening,
      message: reopening
        ? `The kitchen is closed right now — we open again at ${reopening}.`
        : "The kitchen is closed right now — browse the menu and order when we open.",
      acceptsOrders: false,
    };
  }
  return { isOpen: true, opensAt: null, message: "", acceptsOrders: true };
}

/**
 * The next time the kitchen opens, as "HH:MM" in the restaurant's timezone.
 * Looks at the remainder of today first, then the next six days.
 */
function nextOpeningTime(hours: OpeningHours, now: Date, timezone: string): string | null {
  const zoned = zonedNow(now, timezone);
  const keys = DAY_KEYS;
  const startIndex = keys.indexOf(zoned.dayKey);
  if (startIndex === -1) return null;

  for (let offset = 0; offset < keys.length; offset += 1) {
    const key = keys[(startIndex + offset) % keys.length];
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

