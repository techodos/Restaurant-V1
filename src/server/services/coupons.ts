import { getStorefrontCache, readCoupon, snapshotForRestaurant } from "@/server/cache";
import { forRestaurant, type RequestContext } from "@/server/context";
import type { Coupon } from "@/shared/contract/models";
import {
  couponUsageSummary,
  createCoupon,
  deleteCoupon,
  getCouponByCode,
  listCoupons,
  updateCoupon,
  type CouponInput,
} from "@/server/repositories/coupons";

function normalize(value: string | undefined): string | null {
  return value && value.trim() ? value.trim() : null;
}

/**
 * A coupon for the tray's promo-code PREVIEW (cart page, checkout summary): from the storefront snapshot,
 * so applying a code costs no database round trip. Never used to charge — the order transaction re-reads
 * the coupon and enforces usage limits (`createOrder`). Null when unknown or inactive.
 */
export async function findPreviewCoupon(restaurantId: string, code: string): Promise<Coupon | null> {
  const snapshot = snapshotForRestaurant(restaurantId);
  const coupon = snapshot ? readCoupon(snapshot, code) : await getCouponByCode(restaurantId, code, forRestaurant(restaurantId));
  return coupon?.isActive ? coupon : null;
}

/** Staff-facing coupon directory + CRUD (admin). Every write refreshes the snapshot's coupon previews. */
export function listCouponsForAdmin(restaurantId: string, ctx: RequestContext): Promise<Coupon[]> {
  return listCoupons(restaurantId, ctx);
}

export async function saveCoupon(restaurantId: string, input: CouponInput & { id?: string }, ctx: RequestContext): Promise<Coupon> {
  const patch: CouponInput = {
    ...input,
    description: normalize(input.description ?? undefined),
    minOrderAmount: normalize(input.minOrderAmount ?? undefined) ?? undefined,
    maxDiscountAmount: normalize(input.maxDiscountAmount ?? undefined),
    startsAt: normalize(input.startsAt ?? undefined),
    endsAt: normalize(input.endsAt ?? undefined),
  };
  const saved = await (input.id ? updateCoupon(input.id, patch, ctx) : createCoupon(restaurantId, patch, ctx));
  getStorefrontCache().invalidate(); // the tray's promo preview reads coupons from the snapshot
  return saved;
}

export async function removeCoupon(couponId: string, ctx: RequestContext): Promise<void> {
  await deleteCoupon(couponId, ctx);
  getStorefrontCache().invalidate();
}

export function getCouponUsageSummary(
  restaurantId: string,
  ctx: RequestContext,
): Promise<Record<string, { orders: number; discount: string }>> {
  return couponUsageSummary(restaurantId, ctx);
}
