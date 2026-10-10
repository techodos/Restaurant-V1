import { getPlatformRestaurant } from "@/web/platform";
import { adminPath } from "@/shared/utils";
import { RestaurantTabs } from "@/components/super-admin/restaurant-tabs";
import { PageHeader, StatusBadge } from "@/components/super-admin/ui";
import { restaurantStatusTone } from "@/components/super-admin/status";

/** One restaurant: breadcrumb, name, status and the section tabs, shared by the Features and Website screens. */
export default async function SuperAdminRestaurantLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const restaurant = await getPlatformRestaurant(slug);
  const status = restaurantStatusTone(restaurant.status);

  return (
    <div className="space-y-6">
      <div className="space-y-5">
        <PageHeader
          breadcrumbs={[{ label: "All restaurants", href: "/super-admin" }, { label: restaurant.name }]}
          title={restaurant.name}
          description={
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
              <span className="font-mono text-xs">/r/{restaurant.slug}</span>
            </span>
          }
        />
        <RestaurantTabs slug={restaurant.slug} adminHref={adminPath(restaurant.slug)} />
      </div>
      {children}
    </div>
  );
}
