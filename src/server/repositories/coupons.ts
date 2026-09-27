import { getDb } from "@/server/db/registry";
import { type RequestContext } from "@/server/context";
import { mapCoupon, num, str, type Row } from "@/server/db/mappers";
import type { Coupon } from "@/shared/contract/models";
import { dec } from "@/shared/money";
import type { CouponPricing } from "@/server/domain/pricing";

export async function listCoupons(restaurantId: string, ctx: RequestContext = {}): Promise<Coupon[]> {
  const rows = await getDb({ restaurantId }).query<Row>(
    ctx,
    `select * from coupons where restaurant_id = $1 order by is_active desc, created_at desc`,
    [restaurantId],
  );
  return rows.map(mapCoupon);
}

/**
 * Coupon lookup by code, for a guest or customer applying a promo at the cart/checkout. Coupons are
 * commercial data with no `app_runtime` select policy (RLS only lets staff with `coupons.view` read
 * this table, see `coupons_team_select` in migration 0006) — a plain RLS-scoped read here always
 * returns zero rows for a customer, which looked like "every code says invalid" even for a live,
 * active coupon. Runs on the privileged connection instead, same as `getCouponById` below.
 */
export async function getCouponByCode(
  restaurantId: string,
  code: string,
  ctx: RequestContext = {},
): Promise<Coupon | null> {
  const row = await getDb({ restaurantId }).write(ctx, async (tx) =>
    tx.queryOne<Row>(`select * from coupons where restaurant_id = $1 and code = upper(trim($2)) limit 1`, [restaurantId, code]),
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
  const row = await getDb(ctx).write(ctx, async (tx) =>
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
    eligibleEmails: coupon.eligibleEmails,
    eligiblePhones: coupon.eligiblePhones,
  };
}

/**
 * How many times this phone number already used the coupon — restaurant-wide, across every
 * customer, which is exactly what `orders_customer` (RLS, migration 0006) never allows: that policy
 * only ever exposes the current visitor's own `customer_id` rows. Read via `.queryOne` this always
 * undercounted (0 for a guest, at most the current customer's own orders otherwise), which silently
 * defeated `usageLimitPerCustomer` — the same coupon could be reused past its per-customer cap from
 * a fresh guest cart / another account. Runs on the privileged connection, same reasoning as
 * `getCouponByCode` above.
 */
export async function countCouponUsageByPhone(
  restaurantId: string,
  couponId: string,
  phone: string,
  ctx: RequestContext = {},
): Promise<number> {
  const row = await getDb({ restaurantId }).write(ctx, async (tx) =>
    tx.queryOne<{ count: string }>(
      `select count(*) from orders
        where restaurant_id = $1 and coupon_id = $2 and customer_phone = $3 and status <> 'cancelled'`,
      [restaurantId, couponId, phone],
    ),
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
  /** empty = open to everyone; non-empty = only these (lowercased emails / E.164 phones) may redeem it */
  eligibleEmails?: string[];
  eligiblePhones?: string[];
}

export async function createCoupon(restaurantId: string, input: CouponInput, ctx: RequestContext): Promise<Coupon> {
  const db = getDb({ restaurantId });
  return db.write(ctx, async (tx) => {
    const row = await tx.queryOne<Row>(
      `insert into coupons
         (restaurant_id, code, description, discount_type, discount_value, min_order_amount, max_discount_amount,
          applies_to, order_types, starts_at, ends_at, usage_limit, usage_limit_per_customer, is_active,
          eligible_emails, eligible_phones)
       values ($1, upper(trim($2)), $3, $4, $5::numeric, coalesce($6::numeric,0), $7::numeric,
               coalesce($8,'order'), coalesce($9::order_type[], '{delivery,pickup,dine_in}'::order_type[]),
               $10::timestamptz, $11::timestamptz, $12, $13, coalesce($14, true),
               coalesce($15::text[], '{}'::text[]), coalesce($16::text[], '{}'::text[]))
       returning *`,
      [
        restaurantId, input.code, input.description ?? null, input.discountType, input.discountValue,
        input.minOrderAmount ?? null, input.maxDiscountAmount ?? null, input.appliesTo ?? null,
        input.orderTypes ?? null, input.startsAt ?? null, input.endsAt ?? null,
        input.usageLimit ?? null, input.usageLimitPerCustomer ?? null, input.isActive ?? null,
        input.eligibleEmails ?? null, input.eligiblePhones ?? null,
      ],
    );
    if (!row) throw new Error("Coupon insert failed");
    return mapCoupon(row);
  });
}

export async function updateCoupon(couponId: string, patch: Partial<CouponInput>, ctx: RequestContext): Promise<Coupon> {
  const db = getDb(ctx);
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
         is_active = coalesce($14, is_active),
         eligible_emails = coalesce($15::text[], eligible_emails),
         eligible_phones = coalesce($16::text[], eligible_phones)
       where id = $1
       returning *`,
      [
        couponId, patch.code ?? null, patch.description ?? null, patch.discountType ?? null,
        patch.discountValue ?? null, patch.minOrderAmount ?? null, patch.maxDiscountAmount ?? null,
        patch.appliesTo ?? null, patch.orderTypes ?? null, patch.startsAt ?? null, patch.endsAt ?? null,
        patch.usageLimit ?? null, patch.usageLimitPerCustomer ?? null, patch.isActive ?? null,
        patch.eligibleEmails ?? null, patch.eligiblePhones ?? null,
      ],
    );
    if (!row) throw new Error("Coupon not found");
    return mapCoupon(row);
  });
}

export async function setCouponActive(couponId: string, isActive: boolean, ctx: RequestContext): Promise<void> {
  await getDb(ctx).write(ctx, async (tx) => {
    await tx.query(`update coupons set is_active = $2 where id = $1`, [couponId, isActive]);
  });
}

export async function deleteCoupon(couponId: string, ctx: RequestContext): Promise<void> {
  await getDb(ctx).write(ctx, async (tx) => {
    await tx.query(`delete from coupons where id = $1`, [couponId]);
  });
}

/** Discount saved per coupon code, for the admin coupon usage table. */
export async function couponUsageSummary(
  restaurantId: string,
  ctx: RequestContext = {},
): Promise<Record<string, { orders: number; discount: string }>> {
  const rows = await getDb({ restaurantId }).query<Row>(
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
