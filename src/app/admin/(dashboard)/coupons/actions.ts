"use server";

import { revalidatePath } from "next/cache";
import { adminPath } from "@/shared/utils";
import type { ApiResult } from "@/shared/contract/api";
import type { Coupon } from "@/shared/contract/models";
import { action } from "@/server/errors";
import { removeCoupon, saveCoupon } from "@/server/services/coupons";
import { couponSchema } from "@/server/validation/coupons";
import { requireRestaurantWidePermission } from "@/web/session";

export async function saveCouponAction(payload: unknown): Promise<ApiResult<Coupon>> {
  return action(async () => {
    const actor = await requireRestaurantWidePermission("coupons.manage");
    const input = couponSchema.parse(payload);
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    const coupon = await saveCoupon(actor.restaurantId, input, ctx);
    revalidatePath(adminPath(actor.restaurantSlug, "/coupons"));
    return coupon;
  });
}

export async function deleteCouponAction(couponId: string): Promise<ApiResult<null>> {
  return action(async () => {
    const actor = await requireRestaurantWidePermission("coupons.manage");
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    await removeCoupon(couponId, ctx);
    revalidatePath(adminPath(actor.restaurantSlug, "/coupons"));
    return null;
  });
}
