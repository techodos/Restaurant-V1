import type { Metadata } from "next";
import { getLocations } from "@/server/services/restaurants";
import { getAdminRestaurant } from "@/web/admin";
import { requirePermission } from "@/web/session";
import { LocationManager } from "@/components/admin/location-manager";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Locations" };

export default async function AdminLocationsPage() {
  const actor = await requirePermission("locations.view");
  const restaurant = await getAdminRestaurant();

  const locations = await getLocations(restaurant.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Locations</h1>
        <p className="mt-1 text-[var(--color-muted-ink)]">{locations.length} branches</p>
      </div>
      <LocationManager locations={locations} canManage={actor.permissions.includes("locations.manage")} />
    </div>
  );
}
