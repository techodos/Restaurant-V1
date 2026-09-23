import type { RequestContext } from "@/server/context";
import type { Coupon } from "@/shared/contract/models";
import {
  couponUsageSummary,
  createCoupon,
  deleteCoupon,
  listCoupons,
  updateCoupon,
  type CouponInput,
} from "@/server/repositories/coupons";

function normalize(value: string | undefined): string | null {
  return value && value.trim() ? value.trim() : null;
}

/** Staff-facing coupon directory + CRUD (admin). Coupons are never in the storefront snapshot — no cache invalidation. */
export function listCouponsForAdmin(restaurantId: string, ctx: RequestContext): Promise<Coupon[]> {
  return listCoupons(restaurantId, ctx);
}

export function saveCoupon(restaurantId: string, input: CouponInput & { id?: string }, ctx: RequestContext): Promise<Coupon> {
  const patch: CouponInput = {
    ...input,
    description: normalize(input.description ?? undefined),
    minOrderAmount: normalize(input.minOrderAmount ?? undefined) ?? undefined,
    maxDiscountAmount: normalize(input.maxDiscountAmount ?? undefined),
    startsAt: normalize(input.startsAt ?? undefined),
    endsAt: normalize(input.endsAt ?? undefined),
  };
  return input.id ? updateCoupon(input.id, patch, ctx) : createCoupon(restaurantId, patch, ctx);
}

export function removeCoupon(couponId: string, ctx: RequestContext): Promise<void> {
  return deleteCoupon(couponId, ctx);
}

export function getCouponUsageSummary(
  restaurantId: string,
  ctx: RequestContext,
): Promise<Record<string, { orders: number; discount: string }>> {
  return couponUsageSummary(restaurantId, ctx);
}
