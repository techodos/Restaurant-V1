import type { Metadata } from "next";
import { getLocations } from "@/server/services/restaurants";
import { getAdminMaps, getAdminRestaurant } from "@/web/admin";
import { requireAdminPage } from "@/web/session";
import { memberBranch } from "@/server/auth/branch-scope";
import { LocationManager } from "@/components/admin/location-manager";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Locations" };

export default async function AdminLocationsPage({ params }: { params: Promise<{ restaurantSlug: string }> }) {
  const { restaurantSlug } = await params;
  const actor = await requireAdminPage("locations.view", restaurantSlug);
  const restaurant = await getAdminRestaurant(restaurantSlug);

  // branch staff see their own branch only; adding/editing branches is owner/admin (locations.manage)
  const own = memberBranch(actor);
  const locations = (await getLocations(restaurant.id)).filter((location) => own === null || location.id === own);

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Locations" description={`${locations.length} branches`} />
      <LocationManager
        locations={locations}
        canManage={actor.permissions.includes("locations.manage")}
        maps={getAdminMaps(restaurant)}
      />
    </div>
  );
}
