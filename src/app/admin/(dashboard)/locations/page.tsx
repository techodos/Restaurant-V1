import type { Metadata } from "next";
import { getLocationsForAdmin } from "@/server/services/restaurants";
import { getAdminMaps, getAdminRestaurant } from "@/web/admin";
import { requireAdminPage } from "@/web/session";
import { memberBranch } from "@/server/auth/branch-scope";
import { LocationManager } from "@/components/admin/location-manager";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { instanceRestaurantSlug } from "@/web/instance";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Locations" };

export default async function AdminLocationsPage() {
  const restaurantSlug = instanceRestaurantSlug();
  const actor = await requireAdminPage("locations.view", restaurantSlug);
  const restaurant = await getAdminRestaurant(restaurantSlug);

  // branch staff see their own branch only; adding/editing branches is owner/admin (locations.manage)
  const own = memberBranch(actor);
  const locations = (await getLocationsForAdmin(restaurant.id, { userId: actor.userId, actor: actor.name })).filter((location) => own === null || location.id === own);

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Locations" description={`${locations.length} ${locations.length === 1 ? "branch" : "branches"}`} />
      <LocationManager
        locations={locations}
        canManage={actor.permissions.includes("locations.manage")}
        maps={getAdminMaps(restaurant)}
      />
    </div>
  );
}
