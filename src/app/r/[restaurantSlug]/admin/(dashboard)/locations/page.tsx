import type { Metadata } from "next";
import { getLocations } from "@/server/services/restaurants";
import { getAdminRestaurant } from "@/web/admin";
import { requirePermission } from "@/web/session";
import { LocationManager } from "@/components/admin/location-manager";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Locations" };

export default async function AdminLocationsPage({ params }: { params: Promise<{ restaurantSlug: string }> }) {
  const { restaurantSlug } = await params;
  const actor = await requirePermission("locations.view", restaurantSlug);
  const restaurant = await getAdminRestaurant(restaurantSlug);

  const locations = await getLocations(restaurant.id);

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Locations" description={`${locations.length} branches`} />
      <LocationManager locations={locations} canManage={actor.permissions.includes("locations.manage")} />
    </div>
  );
}
