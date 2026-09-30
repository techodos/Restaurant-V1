import type { Metadata } from "next";
import { listDeliveryZonesForAdmin } from "@/server/services/delivery-zones";
import { getLocations } from "@/server/services/restaurants";
import { getAdminRestaurant } from "@/web/admin";
import { requirePermission } from "@/web/session";
import { DeliveryZoneManager } from "@/components/admin/delivery-zone-manager";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Delivery zones" };

export default async function AdminDeliveryZonesPage({ params }: { params: Promise<{ restaurantSlug: string }> }) {
  const { restaurantSlug } = await params;
  const actor = await requirePermission("delivery.view", restaurantSlug);
  const restaurant = await getAdminRestaurant(restaurantSlug);
  const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };

  const [zones, locations] = await Promise.all([
    listDeliveryZonesForAdmin(restaurant.id, ctx),
    getLocations(restaurant.id),
  ]);

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Delivery zones" description={`${zones.length} zones`} />
      <DeliveryZoneManager zones={zones} locations={locations} />
    </div>
  );
}
