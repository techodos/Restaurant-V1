import type { Metadata } from "next";
import { listDeliveryZonesForAdmin } from "@/server/services/delivery-zones";
import { getLocations } from "@/server/services/restaurants";
import { getAdminRestaurant } from "@/web/admin";
import { requirePermission } from "@/web/session";
import { DeliveryZoneManager } from "@/components/admin/delivery-zone-manager";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Delivery zones" };

export default async function AdminDeliveryZonesPage() {
  const actor = await requirePermission("delivery.view");
  const restaurant = await getAdminRestaurant();
  const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };

  const [zones, locations] = await Promise.all([
    listDeliveryZonesForAdmin(restaurant.id, ctx),
    getLocations(restaurant.id),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">Delivery zones</h1>
        <p className="mt-1 text-[var(--color-muted-ink)]">{zones.length} zones</p>
      </div>
      <DeliveryZoneManager zones={zones} locations={locations} />
    </div>
  );
}
