import type { Metadata } from "next";
import { requireSuperAdminPage } from "@/web/session";
import { listRestaurantsForPlatform } from "@/server/services/platform";
import { ENTITLEMENT_KEYS, ENTITLEMENT_LABELS } from "@/shared/feature-access";
import { adminPath } from "@/shared/utils";
import { PageHeader } from "@/components/super-admin/ui";
import { RestaurantList, type RestaurantSummary } from "@/components/super-admin/restaurant-list";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Restaurants" };

export default async function SuperAdminHomePage() {
  const actor = await requireSuperAdminPage();
  const restaurants = await listRestaurantsForPlatform(actor);
  // only what the list shows crosses to the browser
  const summaries: RestaurantSummary[] = restaurants.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    status: r.status,
    cuisines: r.cuisines,
    createdAt: r.createdAt,
    disabled: ENTITLEMENT_KEYS.filter((key) => !r.entitlements[key]).map((key) => ENTITLEMENT_LABELS[key]),
    adminHref: adminPath(r.slug),
  }));

  return (
    <div className="space-y-6">
      <PageHeader title="Restaurants" description="Manage restaurants, platform access, features and websites." />
      <RestaurantList restaurants={summaries} />
    </div>
  );
}
