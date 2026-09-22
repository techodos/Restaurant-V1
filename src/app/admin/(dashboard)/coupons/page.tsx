import type { Metadata } from "next";
import { getCouponUsageSummary, listCouponsForAdmin } from "@/server/services/coupons";
import { getAdminRestaurant } from "@/web/admin";
import { requirePermission } from "@/web/session";
import { CouponManager } from "@/components/admin/coupon-manager";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Coupons" };

export default async function AdminCouponsPage() {
  const actor = await requirePermission("coupons.view");
  const restaurant = await getAdminRestaurant();
  const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };

  const [coupons, usage] = await Promise.all([
    listCouponsForAdmin(restaurant.id, ctx),
    getCouponUsageSummary(restaurant.id, ctx),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Coupons</h1>
        <p className="mt-1 text-[var(--color-muted-ink)]">{coupons.length} coupons</p>
      </div>
      <CouponManager coupons={coupons} usage={usage} />
    </div>
  );
}
