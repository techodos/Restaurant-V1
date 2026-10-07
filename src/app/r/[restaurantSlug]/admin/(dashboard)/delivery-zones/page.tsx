import type { Metadata } from "next";
import { listDeliveryZonesForAdmin } from "@/server/services/delivery-zones";
import { getLocations } from "@/server/services/restaurants";
import { getAdminRestaurant } from "@/web/admin";
import { requireAdminPage } from "@/web/session";
import { getAdminBranchScope, getAdminMaps } from "@/web/admin";
import { DeliveryZoneManager } from "@/components/admin/delivery-zone-manager";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Delivery zones" };

export default async function AdminDeliveryZonesPage({ params }: { params: Promise<{ restaurantSlug: string }> }) {
  const { restaurantSlug } = await params;
  const actor = await requireAdminPage("delivery.view", restaurantSlug);
  const restaurant = await getAdminRestaurant(restaurantSlug);
  const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };

  // the zones of the branch in scope (a manager: their own; owner/admin: the header's choice, or all)
  const scope = await getAdminBranchScope(restaurantSlug);
  const [zones, locations] = await Promise.all([
    listDeliveryZonesForAdmin(restaurant.id, ctx, scope.locationId),
    getLocations(restaurant.id),
  ]);
  // where new zones may go: a branch manager only into their own branch
  const zoneBranches = scope.locked ? locations.filter((location) => location.id === scope.locationId) : locations;

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Delivery zones" description={`${zones.length} zones`} />
      <DeliveryZoneManager
        zones={zones}
        locations={zoneBranches}
        allLocations={locations}
        canManage={actor.permissions.includes("delivery.manage")}
        mapsKey={getAdminMaps(restaurant)?.apiKey ?? null}
      />
    </div>
  );
}
