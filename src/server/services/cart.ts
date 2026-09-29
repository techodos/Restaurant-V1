import type { Coupon, DeliveryZone, OpeningHours, Restaurant, RestaurantLocation } from "@/shared/contract/models";
import { DAY_KEYS, type OrderType } from "@/shared/contract/enums";
import { isOrderTypeEnabled } from "@/shared/ordering";
import { isOpenAt, timeToMinutes, to12Hour, zonedNow } from "@/shared/hours";
import { dec, toMoney, ZERO } from "@/shared/money";
import { trayItemCount, type Tray, type TrayLine } from "@/shared/tray";
import { errors } from "@/server/errors";
import { toCouponPricing } from "@/server/repositories/coupons";
import { matchDeliveryZone } from "@/server/repositories/deliveries";
import { resolveMenuSelection } from "@/server/domain/menu-selection";
import {
  computeCouponDiscount,
  tryCalculatePricing,
  validateCouponOrThrow,
  type PricingResult,
  type ZonePricing,
} from "@/server/domain/pricing";
import { getOrderableMenuItems } from "./catalog";
import { findPreviewCoupon } from "./coupons";

/**
 * The tray (cart) before an order exists. It lives in a browser cookie (`shared/tray.ts`,
 * DECISIONS.md §28) — there is no cart row, and nothing here touches the database: lines are priced
 * from the in-memory storefront menu and the preview coupon from the snapshot, through the SAME
 * resolver (`resolveMenuSelection`) and pricing engine (`calculatePricing`) the order transaction
 * uses. These numbers are a faithful preview; `createOrder` re-derives every one of them from the
 * live database when the order is placed, and only those are ever charged.
 */

export interface TrayLineView {
  /** position in the tray — lines have no id of their own */
  index: number;
  line: TrayLine;
  name: string;
  slug: string | null;
  /** the menu's raw image path; the web layer resolves it for display */
  imageUrl: string | null;
  variantName: string | null;
  addons: { addonId: string; quantity: number; name: string; price: string }[];
  unitPrice: string;
  addonsTotal: string;
  lineTotal: string;
  /** why this line cannot be ordered right now (sold out, removed, option gone…), else null */
  problem: string | null;
}

export interface TrayView {
  lines: TrayLineView[];
  itemCount: number;
  /** of the orderable lines only */
  subtotal: string;
}

/** Resolves every tray line against the current menu. Unorderable lines are kept and flagged, never dropped silently. */
export async function viewTray(restaurant: Restaurant, tray: Tray, now = new Date()): Promise<TrayView> {
  const menu = await getOrderableMenuItems(restaurant.id, tray.lines.map((line) => line.menuItemId));
  let subtotal = ZERO;
  const lines = tray.lines.map((line, index): TrayLineView => {
    const entry = menu.get(line.menuItemId);
    try {
      const resolved = resolveMenuSelection(entry, line, restaurant.timezone, now);
      // A buffet package (priced per head) is a dine-in booking. Flagged like any other unorderable
      // line, so the tray, the checkout page and the order transaction (createOrder) all refuse it.
      if (resolved.item.isBuffetPackage && tray.orderType !== "dine_in") {
        throw new Error("It is a dine-in buffet and can only be ordered as Dine-in.");
      }
      const lineTotal = dec(resolved.unitPrice).plus(dec(resolved.addonsTotal)).times(line.quantity);
      subtotal = subtotal.plus(lineTotal);
      return {
        index,
        line,
        name: resolved.item.name,
        slug: resolved.item.slug,
        imageUrl: resolved.item.imageUrl,
        variantName: resolved.variant?.name ?? null,
        addons: resolved.addons.map((addon) => ({ addonId: addon.addonId, quantity: addon.quantity, name: addon.name, price: addon.price })),
        unitPrice: resolved.unitPrice,
        addonsTotal: resolved.addonsTotal,
        lineTotal: toMoney(lineTotal),
        problem: null,
      };
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      return {
        index,
        line,
        name: entry?.item.name ?? "An item no longer on the menu",
        slug: entry?.item.slug ?? null,
        imageUrl: entry?.item.imageUrl ?? null,
        variantName: null,
        addons: [],
        unitPrice: "0.00",
        addonsTotal: "0.00",
        lineTotal: "0.00",
        problem: error.message,
      };
    }
  });
  return { lines, itemCount: trayItemCount(tray), subtotal: toMoney(subtotal) };
}

export interface TrayPricingResult {
  pricing: PricingResult | null;
  zone: ZonePricing | null;
  coupon: Coupon | null;
  /** human-readable reasons the tray cannot be checked out yet */
  blockers: string[];
  /** set when the tray's promo code no longer applies (the tray is priced without it, not blocked) */
  couponNotice: string | null;
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

/**
 * The checkout page's price breakdown for a tray: same engine as the order, fed from the storefront
 * snapshot (menu, zones, coupon definition). Validation failures become messages, not exceptions, so
 * the page can say what to fix. `zones` are the active zones the page already shows in its picker.
 */
export async function priceTray(
  restaurant: Restaurant,
  tray: Tray,
  view: TrayView,
  options: {
    zones: DeliveryZone[];
    orderType?: OrderType;
    address?: { area?: string | null; city?: string | null; postalCode?: string | null } | null;
    /** the signed-in customer's own email/mobile, for a coupon restricted to specific customers */
    customer?: CouponCustomer | null;
  },
): Promise<TrayPricingResult> {
  const orderType = options.orderType ?? tray.orderType;
  const problems = view.lines.filter((line) => line.problem);
  const blockers = problems.map((line) => `${line.name}: ${line.problem} Remove it from your cart to continue.`);

  const matched =
    orderType === "delivery"
      ? options.address
        ? matchDeliveryZone(options.zones, options.address)
        : (options.zones.find((candidate) => candidate.locationId === tray.locationId) ?? options.zones[0] ?? null)
      : null;
  const zone = matched ? toZonePricing(matched) : null;
  const coupon = tray.couponCode ? await findPreviewCoupon(restaurant.id, tray.couponCode) : null;

  const orderable = view.lines.filter((line) => !line.problem);
  if (orderable.length === 0 && blockers.length === 0) blockers.push("Your cart is empty.");

  const price = (withCoupon: Coupon | null) =>
    tryCalculatePricing({
      lines: orderable.map((line) => ({ unitPrice: line.unitPrice, addonsTotal: line.addonsTotal, quantity: line.line.quantity })),
      orderType,
      settings: restaurant.settings,
      zone,
      coupon: withCoupon ? toCouponPricing(withCoupon) : null,
      customerEmail: options.customer?.email ?? null,
      customerPhone: options.customer?.phone ?? null,
    });

  let couponNotice: string | null =
    tray.couponCode && !coupon ? `Promo code ${tray.couponCode.toUpperCase()} is no longer valid.` : null;
  let applied = coupon;
  let result = price(applied);
  if (!result.ok && applied && result.error.code.startsWith("COUPON")) {
    // a code that stopped applying (minimum not met any more, wrong order type, expired) must not block
    // the order — price without it and say why
    couponNotice = `Promo code ${applied.code} was not applied: ${result.error.message}`;
    applied = null;
    result = price(null);
  }
  if (!result.ok) return { pricing: null, zone, coupon: applied, blockers: [...blockers, result.error.message], couponNotice };
  return { pricing: result.pricing, zone, coupon: applied, blockers, couponNotice };
}

export interface CouponPreview {
  code: string;
  discount: string;
}

/** Who is applying a code, for a coupon restricted to specific customers (eligibleEmails/eligiblePhones). */
export interface CouponCustomer {
  email: string | null;
  phone: string | null;
}

/**
 * Validates a promo code against the tray's subtotal for the cart page — from the snapshot, no
 * database round trip. Usage limits (per code, per customer) are enforced when the order is placed.
 * `customer` is asked for ONLY when the code is restricted to specific customers (rare), so an ordinary
 * code still costs no database read; left out (the layout re-previewing an already-applied code), the
 * restriction is not checked here — the checkout page and the order transaction always check it.
 */
export async function previewCoupon(
  restaurant: Restaurant,
  code: string,
  orderType: OrderType,
  subtotal: string,
  customer?: () => Promise<CouponCustomer>,
): Promise<CouponPreview> {
  if (!code.trim()) return { code: "", discount: "0.00" };
  if (!restaurant.features.coupons) throw errors.custom("COUPON_INVALID", "Promo codes are not available right now.");
  const coupon = await findPreviewCoupon(restaurant.id, code);
  if (!coupon) throw errors.custom("COUPON_INVALID", "That promo code is not valid.");

  const restricted = coupon.eligibleEmails.length > 0 || coupon.eligiblePhones.length > 0;
  const who = restricted && customer ? await customer() : null;
  const pricing = toCouponPricing(coupon);
  const validated = validateCouponOrThrow(
    // without a way to ask who is applying it, preview as unrestricted (see above)
    restricted && !customer ? { ...pricing, eligibleEmails: [], eligiblePhones: [] } : pricing,
    { subtotal, orderType, customerEmail: who?.email ?? null, customerPhone: who?.phone ?? null },
  );
  // the delivery fee is not known on the cart page, so a delivery-fee coupon previews as "no discount yet"
  const discount = validated.appliesTo === "delivery_fee" ? ZERO : computeCouponDiscount(validated, dec(subtotal), ZERO);
  return { code: validated.code, discount: toMoney(discount) };
}

/** Rejects a tray whose ordering option is switched off before anything is written. */
export function assertTrayOrderable(restaurant: Restaurant, tray: Tray): void {
  if (!restaurant.features.onlineOrdering) throw errors.custom("ORDERING_DISABLED", "Online ordering is paused right now.");
  if (!isOrderTypeEnabled(restaurant.features, tray.orderType)) {
    throw errors.custom("ORDERING_DISABLED", "That ordering option is currently unavailable.");
  }
  if (tray.lines.length === 0) throw errors.custom("CART_EMPTY", "Your cart is empty.");
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
