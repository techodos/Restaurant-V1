import type { Metadata } from "next";
import { Layers, ListPlus, Store } from "lucide-react";
import { AdminSection } from "@/components/admin/admin-ui";
import { adminPath } from "@/shared/utils";
import { notFound } from "next/navigation";
import { getItemLocationOverridesForAdmin, getMenuItemForAdmin, listCategoriesForAdmin } from "@/server/services/menu-admin";
import { getLocations } from "@/server/services/restaurants";
import { getAdminRestaurant } from "@/web/admin";
import { requireAdminPage } from "@/web/session";
import { AddonGroupManager } from "@/components/admin/addon-group-manager";
import { BranchAvailabilityManager } from "@/components/admin/branch-availability-manager";
import { MenuItemForm } from "@/components/admin/menu-item-form";
import { VariantManager } from "@/components/admin/variant-manager";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { instanceRestaurantSlug } from "@/web/instance";

interface EditItemPageProps {
  params: Promise<{ itemId: string }>;
}

export const metadata: Metadata = { title: "Edit item" };

export default async function EditMenuItemPage({ params }: EditItemPageProps) {
  const restaurantSlug = instanceRestaurantSlug();
  const { itemId } = await params;
  const actor = await requireAdminPage("menu.manage", restaurantSlug, { restaurantWide: true }); // the shared menu: owner/admin
  const restaurant = await getAdminRestaurant(restaurantSlug);
  const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };

  const [item, categories, locations] = await Promise.all([
    getMenuItemForAdmin(restaurant.id, itemId, ctx),
    listCategoriesForAdmin(restaurant.id, ctx),
    getLocations(restaurant.id, { activeOnly: true }),
  ]);
  if (!item) notFound();
  const overrides = locations.length > 1 ? await getItemLocationOverridesForAdmin(itemId, ctx) : new Map<string, boolean>();

  return (
    <div className="space-y-8">
      <AdminPageHeader backHref={adminPath("/menu")} backLabel="Back to menu" title={item.name} />

      <MenuItemForm item={item} categories={categories} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-5">
        <AdminSection title="Variants" description="Optional. Leave empty if this item has one fixed price." icon={Layers}>
          <VariantManager menuItemId={item.id} variants={item.variants} />
        </AdminSection>

        {locations.length > 1 ? (
          <AdminSection
            title="Branch availability"
            description="Off at a branch means it can't be ordered there, even though it stays on the restaurant-wide menu."
            icon={Store}
          >
            <BranchAvailabilityManager menuItemId={item.id} locations={locations} overrides={Object.fromEntries([...overrides].sort(([a], [b]) => a.localeCompare(b)))} />
          </AdminSection>
        ) : null}

        <AdminSection title="Add-on groups" description="Optional extras a customer can add (e.g. toppings, sides)." icon={ListPlus}>
          <AddonGroupManager menuItemId={item.id} groups={item.addonGroups} />
        </AdminSection>
      </div>
    </div>
  );
}
