import type { Metadata } from "next";
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

interface EditItemPageProps {
  params: Promise<{ restaurantSlug: string; itemId: string }>;
}

export const metadata: Metadata = { title: "Edit item" };

export default async function EditMenuItemPage({ params }: EditItemPageProps) {
  const { restaurantSlug, itemId } = await params;
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
      <AdminPageHeader backHref={adminPath(restaurantSlug, "/menu")} backLabel="Back to menu" title={item.name} />

      <MenuItemForm item={item} categories={categories} />

      <section>
        <h2 className="mb-3 text-lg font-semibold">Variants</h2>
        <p className="mb-3 text-sm text-[var(--color-muted-ink)]">Optional. Leave empty if this item has one fixed price.</p>
        <VariantManager menuItemId={item.id} variants={item.variants} />
      </section>

      {locations.length > 1 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Branch availability</h2>
          <p className="mb-3 text-sm text-[var(--color-muted-ink)]">
            Off at a branch means it can&apos;t be ordered from that branch, even though it stays on the restaurant-wide menu above.
          </p>
          <BranchAvailabilityManager menuItemId={item.id} locations={locations} overrides={Object.fromEntries([...overrides].sort(([a], [b]) => a.localeCompare(b)))} />
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Add-on groups</h2>
        <p className="mb-3 text-sm text-[var(--color-muted-ink)]">Optional extras a customer can add (e.g. toppings, sides).</p>
        <AddonGroupManager menuItemId={item.id} groups={item.addonGroups} />
      </section>
    </div>
  );
}
