import type { Metadata } from "next";
import { getCouponUsageSummary, listCouponsForAdmin } from "@/server/services/coupons";
import { getAdminRestaurant } from "@/web/admin";
import { requirePermission } from "@/web/session";
import { CouponManager } from "@/components/admin/coupon-manager";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Coupons" };

export default async function AdminCouponsPage({ params }: { params: Promise<{ restaurantSlug: string }> }) {
  const { restaurantSlug } = await params;
  const actor = await requirePermission("coupons.view", restaurantSlug);
  const restaurant = await getAdminRestaurant(restaurantSlug);
  const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };

  const [coupons, usage] = await Promise.all([
    listCouponsForAdmin(restaurant.id, ctx),
    getCouponUsageSummary(restaurant.id, ctx),
  ]);

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Coupons" description={`${coupons.length} coupons`} />
      <CouponManager coupons={coupons} usage={usage} />
    </div>
  );
}
