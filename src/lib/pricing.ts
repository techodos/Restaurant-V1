import Decimal from "decimal.js";
import { dec, extractIncludedTax, percentageOf, round2, sumMoney, toMoney, ZERO } from "./money";
import type { ErrorCode } from "./contract/api";
import type { OrderType } from "./contract/enums";
import type { RestaurantSettings } from "./contract/settings";

/**
 * THE pricing engine. Every money calculation in the platform — cart totals,
 * checkout preview, server-side order creation, admin order editing and the
 * receipt — goes through this module. Prices received from the browser are
 * never trusted; they are recomputed here from database values.
 *
 * Pipeline:
 *   line_total   = (unit_price + addons_total) * quantity
 *   subtotal     = Σ line_total
 *   discount     = coupon applied to subtotal (or to the delivery fee)
 *   delivery_fee = zone fee, free above the zone threshold, 0 for pickup/dine-in
 *   service_fee  = settings.serviceFee applied to (subtotal - discount)
 *   taxable      = subtotal - discount + service_fee (+ delivery_fee when configured)
 *   tax          = taxable * rate/100   (or extracted when prices include tax)
 *   total        = subtotal - discount + delivery_fee + service_fee + tax + tip
 */

export class PricingError extends Error {
  readonly code: ErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "PricingError";
    this.code = code;
    this.details = details;
  }
}

export interface PricingLineInput {
  unitPrice: string | number | Decimal;
  addonsTotal: string | number | Decimal;
  quantity: number;
}

export interface ZonePricing {
  id?: string;
  name?: string;
  deliveryFee: string | number | Decimal;
  minOrderAmount: string | number | Decimal;
  freeDeliveryOver: string | number | Decimal | null;
  etaMinMinutes?: number;
  etaMaxMinutes?: number;
}

export interface CouponPricing {
  id: string;
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: string | number | Decimal;
  minOrderAmount: string | number | Decimal;
  maxDiscountAmount: string | number | Decimal | null;
  appliesTo: "order" | "delivery_fee";
  orderTypes: OrderType[];
  startsAt: string | null;
  endsAt: string | null;
  usageLimit: number | null;
  usageLimitPerCustomer: number | null;
  usedCount: number;
  isActive: boolean;
}

export interface PricingInput {
  lines: PricingLineInput[];
  orderType: OrderType;
  settings: RestaurantSettings;
  zone?: ZonePricing | null;
  coupon?: CouponPricing | null;
  tipAmount?: string | number | Decimal | null;
  /** how many times this customer already used the coupon (per-customer limit) */
  couponUsageByCustomer?: number;
  /** injectable clock so promotions can be unit tested deterministically */
  now?: Date;
}

export interface PricingBreakdown {
  orderType: OrderType;
  itemCount: number;
  subtotal: string;
  discount: string;
  /** portion of the discount applied to the food subtotal */
  orderDiscount: string;
  /** portion of the discount applied to the delivery fee */
  deliveryDiscount: string;
  deliveryFee: string;
  serviceFee: string;
  tax: string;
  tip: string;
  total: string;
  taxRate: string;
  taxIncluded: boolean;
  taxLabel: string;
  couponCode: string | null;
  couponId: string | null;
  couponDiscountType: "percentage" | "fixed" | null;
  couponDiscountValue: string | null;
  deliveryZoneId: string | null;
  deliveryZoneName: string | null;
  freeDeliveryApplied: boolean;
  minimumOrderAmount: string;
  calculatedAt: string;
}

export interface PricingResult extends Omit<PricingBreakdown, "calculatedAt"> {
  /** Decimal handles for callers that need to keep computing */
  decimals: {
    subtotal: Decimal;
    discount: Decimal;
    orderDiscount: Decimal;
    deliveryDiscount: Decimal;
    deliveryFee: Decimal;
    serviceFee: Decimal;
    tax: Decimal;
    tip: Decimal;
    total: Decimal;
  };
}

export function lineTotal(line: PricingLineInput): Decimal {
  const quantity = Number.isFinite(line.quantity) ? Math.max(0, Math.trunc(line.quantity)) : 0;
  return round2(dec(line.unitPrice).plus(dec(line.addonsTotal)).times(quantity));
}

export function cartSubtotal(lines: PricingLineInput[]): Decimal {
  return sumMoney(lines.map((line) => lineTotal(line)));
}

/** Effective minimum order for the chosen fulfilment method. */
export function effectiveMinimumOrder(settings: RestaurantSettings, zone?: ZonePricing | null): Decimal {
  const restaurantMinimum = dec(settings.ordering.minimumOrderAmount);
  const zoneMinimum = zone ? dec(zone.minOrderAmount) : ZERO;
  return restaurantMinimum.greaterThan(zoneMinimum) ? restaurantMinimum : zoneMinimum;
}

export interface CouponValidationContext {
  subtotal: Decimal | string | number;
  orderType: OrderType;
  couponUsageByCustomer?: number;
  now?: Date;
}

/**
 * Full server-side coupon validation. Returns the coupon when valid, otherwise
 * throws a PricingError carrying the API error code to show the customer.
 */
export function validateCouponOrThrow(coupon: CouponPricing, context: CouponValidationContext): CouponPricing {
  const now = context.now ?? new Date();
  const subtotal = dec(context.subtotal);

  if (!coupon.isActive) {
    throw new PricingError("COUPON_INVALID", "This promo code is no longer active.", { code: coupon.code });
  }
  if (coupon.startsAt && new Date(coupon.startsAt).getTime() > now.getTime()) {
    throw new PricingError("COUPON_INVALID", "This promo code is not active yet.", { code: coupon.code });
  }
  if (coupon.endsAt && new Date(coupon.endsAt).getTime() < now.getTime()) {
    throw new PricingError("COUPON_EXPIRED", "This promo code has expired.", { code: coupon.code });
  }
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
    throw new PricingError("COUPON_USAGE_LIMIT", "This promo code has reached its usage limit.", { code: coupon.code });
  }
  if (
    coupon.usageLimitPerCustomer !== null &&
    (context.couponUsageByCustomer ?? 0) >= coupon.usageLimitPerCustomer
  ) {
    throw new PricingError("COUPON_USAGE_LIMIT", "You have already used this promo code.", { code: coupon.code });
  }
  if (coupon.orderTypes.length > 0 && !coupon.orderTypes.includes(context.orderType)) {
    throw new PricingError("COUPON_ORDER_TYPE", "This promo code is not valid for the selected order type.", {
      code: coupon.code,
      orderTypes: coupon.orderTypes,
    });
  }
  if (subtotal.lessThan(dec(coupon.minOrderAmount))) {
    throw new PricingError("COUPON_MIN_ORDER", "Your order does not meet the minimum for this promo code.", {
      code: coupon.code,
      minOrderAmount: toMoney(coupon.minOrderAmount),
      subtotal: toMoney(subtotal),
    });
  }
  return coupon;
}

/** Discount amount for a validated coupon (never exceeds the eligible base). */
export function computeCouponDiscount(coupon: CouponPricing, subtotal: Decimal, deliveryFee: Decimal): Decimal {
  const base = coupon.appliesTo === "delivery_fee" ? deliveryFee : subtotal;
  if (base.lessThanOrEqualTo(0)) return ZERO;

  let discount =
    coupon.discountType === "percentage"
      ? percentageOf(base, coupon.discountValue)
      : round2(dec(coupon.discountValue));

  if (coupon.maxDiscountAmount !== null && dec(coupon.maxDiscountAmount).greaterThan(0)) {
    const cap = dec(coupon.maxDiscountAmount);
    if (discount.greaterThan(cap)) discount = cap;
  }
  return discount.greaterThan(base) ? base : discount;
}

export function calculatePricing(input: PricingInput): PricingResult {
  const { lines, orderType, settings, zone, coupon } = input;
  const itemCount = lines.reduce((count, line) => count + Math.max(0, Math.trunc(line.quantity) || 0), 0);

  const subtotal = cartSubtotal(lines);

  // ---- delivery fee ------------------------------------------------------
  let deliveryFee = ZERO;
  let freeDeliveryApplied = false;
  if (orderType === "delivery") {
    if (!settings.delivery.enabled) {
      throw new PricingError("DELIVERY_UNAVAILABLE", "Delivery is currently unavailable.");
    }
    if (!zone) {
      throw new PricingError("DELIVERY_ZONE_REQUIRED", "Select a delivery area to continue.");
    }
    deliveryFee = round2(dec(zone.deliveryFee));
    const threshold = zone.freeDeliveryOver ?? settings.delivery.freeDeliveryOver;
    if (threshold !== null && threshold !== undefined && subtotal.greaterThanOrEqualTo(dec(threshold))) {
      deliveryFee = ZERO;
      freeDeliveryApplied = true;
    }
  }

  // ---- minimum order -----------------------------------------------------
  const minimum = effectiveMinimumOrder(settings, orderType === "delivery" ? zone : null);
  if (subtotal.greaterThan(0) && subtotal.lessThan(minimum)) {
    throw new PricingError("MIN_ORDER_NOT_MET", "Your order is below the minimum order amount.", {
      minimumOrderAmount: toMoney(minimum),
      subtotal: toMoney(subtotal),
    });
  }

  // ---- coupon ------------------------------------------------------------
  // Order-level and delivery-fee discounts are tracked separately: a
  // delivery-fee promo must never reduce the taxable value of the food.
  let discount = ZERO;
  let orderDiscount = ZERO;
  let deliveryDiscount = ZERO;
  let validatedCoupon: CouponPricing | null = null;
  if (coupon) {
    validatedCoupon = validateCouponOrThrow(coupon, {
      subtotal,
      orderType,
      couponUsageByCustomer: input.couponUsageByCustomer,
      now: input.now,
    });
    const couponDiscount = computeCouponDiscount(validatedCoupon, subtotal, deliveryFee);
    if (validatedCoupon.appliesTo === "delivery_fee") {
      deliveryDiscount = couponDiscount;
    } else {
      orderDiscount = couponDiscount;
    }
    discount = orderDiscount.plus(deliveryDiscount);
  }

  const netDeliveryFee = deliveryFee.minus(deliveryDiscount);

  // ---- service fee -------------------------------------------------------
  let serviceFee = ZERO;
  const serviceFeePercent = dec(settings.serviceFee.rate);
  if (settings.serviceFee.enabled && serviceFeePercent.greaterThan(0) && settings.serviceFee.orderTypes.includes(orderType)) {
    serviceFee = percentageOf(subtotal.minus(orderDiscount), serviceFeePercent);
  }

  // ---- tax ---------------------------------------------------------------
  const taxEnabled = settings.tax.enabled;
  const taxRate = taxEnabled ? dec(settings.tax.rate) : ZERO;
  const taxIncluded = taxEnabled && settings.tax.included;

  const taxableBase = subtotal
    .minus(orderDiscount)
    .plus(serviceFee)
    .plus(taxEnabled && settings.tax.applyOnDeliveryFee ? netDeliveryFee : ZERO);

  let tax = ZERO;
  if (taxEnabled && taxRate.greaterThanOrEqualTo(0)) {
    if (taxIncluded) {
      tax = extractIncludedTax(taxableBase, taxRate).tax;
    } else {
      tax = percentageOf(taxableBase, taxRate);
    }
  }

  const tip = round2(dec(input.tipAmount));

  const total = round2(
    subtotal
      .minus(orderDiscount)
      .plus(netDeliveryFee)
      .plus(serviceFee)
      .plus(taxIncluded ? ZERO : tax)
      .plus(tip),
  );

  const breakdown: Omit<PricingBreakdown, "calculatedAt"> = {
    orderType,
    itemCount,
    subtotal: toMoney(subtotal),
    discount: toMoney(discount),
    orderDiscount: toMoney(orderDiscount),
    deliveryDiscount: toMoney(deliveryDiscount),
    deliveryFee: toMoney(netDeliveryFee),
    serviceFee: toMoney(serviceFee),
    tax: toMoney(tax),
    tip: toMoney(tip),
    total: toMoney(total),
    taxRate: taxRate.toFixed(4),
    taxIncluded,
    taxLabel: settings.tax.label,
    couponCode: validatedCoupon?.code ?? null,
    couponId: validatedCoupon?.id ?? null,
    couponDiscountType: validatedCoupon?.discountType ?? null,
    couponDiscountValue: validatedCoupon ? toMoney(validatedCoupon.discountValue) : null,
    deliveryZoneId: orderType === "delivery" ? (zone?.id ?? null) : null,
    deliveryZoneName: orderType === "delivery" ? (zone?.name ?? null) : null,
    freeDeliveryApplied,
    minimumOrderAmount: toMoney(minimum),
  };

  return {
    ...breakdown,
    decimals: {
      subtotal,
      discount,
      orderDiscount,
      deliveryDiscount,
      deliveryFee: netDeliveryFee,
      serviceFee,
      tax,
      tip,
      total,
    },
  };
}

/** Non-throwing wrapper used by cart previews and admin screens. */
export function tryCalculatePricing(input: PricingInput): { ok: true; pricing: PricingResult } | { ok: false; error: PricingError } {
  try {
    return { ok: true, pricing: calculatePricing(input) };
  } catch (error) {
    if (error instanceof PricingError) return { ok: false, error };
    throw error;
  }
}

export function breakdownForStorage(pricing: PricingResult, now = new Date()): PricingBreakdown & { calculatedAt: string } {
  return {
    orderType: pricing.orderType,
    itemCount: pricing.itemCount,
    subtotal: pricing.subtotal,
    discount: pricing.discount,
    orderDiscount: pricing.orderDiscount,
    deliveryDiscount: pricing.deliveryDiscount,
    deliveryFee: pricing.deliveryFee,
    serviceFee: pricing.serviceFee,
    tax: pricing.tax,
    tip: pricing.tip,
    total: pricing.total,
    taxRate: pricing.taxRate,
    taxIncluded: pricing.taxIncluded,
    taxLabel: pricing.taxLabel,
    couponCode: pricing.couponCode,
    couponId: pricing.couponId,
    couponDiscountType: pricing.couponDiscountType,
    couponDiscountValue: pricing.couponDiscountValue,
    deliveryZoneId: pricing.deliveryZoneId,
    deliveryZoneName: pricing.deliveryZoneName,
    freeDeliveryApplied: pricing.freeDeliveryApplied,
    minimumOrderAmount: pricing.minimumOrderAmount,
    calculatedAt: now.toISOString(),
  };
}

/** Estimated ready time = now + prep time (+ delivery buffer for delivery). */
export function estimateReadyAt(prepTimeMinutes: number, orderType: OrderType, now = new Date()): Date {
  const buffer = orderType === "delivery" ? 10 : 0;
  return new Date(now.getTime() + (prepTimeMinutes + buffer) * 60_000);
}
