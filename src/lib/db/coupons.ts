import { getDb, type RequestContext } from "./pool";
import { mapCoupon, num, str, type Row } from "./map";
import type { Coupon } from "../contract/models";
import { dec } from "../money";
import type { CouponPricing } from "../pricing";

export async function listCoupons(restaurantId: string, ctx: RequestContext = {}): Promise<Coupon[]> {
  const rows = await getDb().query<Row>(
    ctx,
    `select * from coupons where restaurant_id = $1 order by is_active desc, created_at desc`,
    [restaurantId],
  );
  return rows.map(mapCoupon);
}

export async function getCouponByCode(
  restaurantId: string,
  code: string,
  ctx: RequestContext = {},
): Promise<Coupon | null> {
  const row = await getDb().queryOne<Row>(
    ctx,
    `select * from coupons where restaurant_id = $1 and code = upper(trim($2)) limit 1`,
    [restaurantId, code],
  );
  return row ? mapCoupon(row) : null;
}

/**
 * Coupon lookup for a guest's own cart. Coupons are commercial data (usage
 * limits, discount caps), so they are never readable from the storefront role —
 * this runs on the privileged server-side connection and returns only what the
 * pricing engine needs.
 */
export async function getCouponById(couponId: string, ctx: RequestContext = {}): Promise<Coupon | null> {
  const row = await getDb().write(ctx, async (tx) =>
    tx.queryOne<Row>(`select * from coupons where id = $1 limit 1`, [couponId]),
  );
  return row ? mapCoupon(row) : null;
}

export function toCouponPricing(coupon: Coupon): CouponPricing {
  return {
    id: coupon.id,
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    minOrderAmount: coupon.minOrderAmount,
    maxDiscountAmount: coupon.maxDiscountAmount,
    appliesTo: coupon.appliesTo,
    orderTypes: coupon.orderTypes,
    startsAt: coupon.startsAt,
    endsAt: coupon.endsAt,
    usageLimit: coupon.usageLimit,
    usageLimitPerCustomer: coupon.usageLimitPerCustomer,
    usedCount: coupon.usedCount,
    isActive: coupon.isActive,
  };
}

/** How many times this phone number already used the coupon. */
export async function countCouponUsageByPhone(
  restaurantId: string,
  couponId: string,
  phone: string,
  ctx: RequestContext = {},
): Promise<number> {
  const row = await getDb().queryOne<{ count: string }>(
    ctx,
    `select count(*) from orders
      where restaurant_id = $1 and coupon_id = $2 and customer_phone = $3 and status <> 'cancelled'`,
    [restaurantId, couponId, phone],
  );
  return row ? Number.parseInt(row.count, 10) : 0;
}

export interface CouponInput {
  code: string;
  description?: string | null;
  discountType: "percentage" | "fixed";
  discountValue: string;
  minOrderAmount?: string;
  maxDiscountAmount?: string | null;
  appliesTo?: "order" | "delivery_fee";
  orderTypes?: string[];
  startsAt?: string | null;
  endsAt?: string | null;
  usageLimit?: number | null;
  usageLimitPerCustomer?: number | null;
  isActive?: boolean;
}

export async function createCoupon(restaurantId: string, input: CouponInput, ctx: RequestContext): Promise<Coupon> {
  const db = getDb();
  return db.write(ctx, async (tx) => {
    const row = await tx.queryOne<Row>(
      `insert into coupons
         (restaurant_id, code, description, discount_type, discount_value, min_order_amount, max_discount_amount,
          applies_to, order_types, starts_at, ends_at, usage_limit, usage_limit_per_customer, is_active)
       values ($1, upper(trim($2)), $3, $4, $5::numeric, coalesce($6::numeric,0), $7::numeric,
               coalesce($8,'order'), coalesce($9::order_type[], '{delivery,pickup,dine_in}'::order_type[]),
               $10::timestamptz, $11::timestamptz, $12, $13, coalesce($14, true))
       returning *`,
      [
        restaurantId, input.code, input.description ?? null, input.discountType, input.discountValue,
        input.minOrderAmount ?? null, input.maxDiscountAmount ?? null, input.appliesTo ?? null,
        input.orderTypes ?? null, input.startsAt ?? null, input.endsAt ?? null,
        input.usageLimit ?? null, input.usageLimitPerCustomer ?? null, input.isActive ?? null,
      ],
    );
    if (!row) throw new Error("Coupon insert failed");
    return mapCoupon(row);
  });
}

export async function updateCoupon(couponId: string, patch: Partial<CouponInput>, ctx: RequestContext): Promise<Coupon> {
  const db = getDb();
  return db.write(ctx, async (tx) => {
    const row = await tx.queryOne<Row>(
      `update coupons set
         code = coalesce(upper(trim($2)), code),
         description = coalesce($3, description),
         discount_type = coalesce($4, discount_type),
         discount_value = coalesce($5::numeric, discount_value),
         min_order_amount = coalesce($6::numeric, min_order_amount),
         max_discount_amount = coalesce($7::numeric, max_discount_amount),
         applies_to = coalesce($8, applies_to),
         order_types = coalesce($9::order_type[], order_types),
         starts_at = coalesce($10::timestamptz, starts_at),
         ends_at = coalesce($11::timestamptz, ends_at),
         usage_limit = coalesce($12, usage_limit),
         usage_limit_per_customer = coalesce($13, usage_limit_per_customer),
         is_active = coalesce($14, is_active)
       where id = $1
       returning *`,
      [
        couponId, patch.code ?? null, patch.description ?? null, patch.discountType ?? null,
        patch.discountValue ?? null, patch.minOrderAmount ?? null, patch.maxDiscountAmount ?? null,
        patch.appliesTo ?? null, patch.orderTypes ?? null, patch.startsAt ?? null, patch.endsAt ?? null,
        patch.usageLimit ?? null, patch.usageLimitPerCustomer ?? null, patch.isActive ?? null,
      ],
    );
    if (!row) throw new Error("Coupon not found");
    return mapCoupon(row);
  });
}

export async function setCouponActive(couponId: string, isActive: boolean, ctx: RequestContext): Promise<void> {
  await getDb().write(ctx, async (tx) => {
    await tx.query(`update coupons set is_active = $2 where id = $1`, [couponId, isActive]);
  });
}

export async function deleteCoupon(couponId: string, ctx: RequestContext): Promise<void> {
  await getDb().write(ctx, async (tx) => {
    await tx.query(`delete from coupons where id = $1`, [couponId]);
  });
}

/** Discount saved per coupon code, for the admin coupon usage table. */
export async function couponUsageSummary(
  restaurantId: string,
  ctx: RequestContext = {},
): Promise<Record<string, { orders: number; discount: string }>> {
  const rows = await getDb().query<Row>(
    ctx,
    `select coupon_code, count(*) as orders, coalesce(sum(discount_amount), 0) as discount
       from orders
      where restaurant_id = $1 and coupon_code is not null and status <> 'cancelled'
      group by coupon_code`,
    [restaurantId],
  );
  const summary: Record<string, { orders: number; discount: string }> = {};
  for (const row of rows) {
    summary[str(row.coupon_code)] = { orders: num(row.orders), discount: dec(str(row.discount)).toFixed(2) };
  }
  return summary;
}
