import type { Metadata } from "next";
import { adminPath } from "@/shared/utils";
import { notFound } from "next/navigation";
import { getMenuItemForAdmin, listCategoriesForAdmin } from "@/server/services/menu-admin";
import { getAdminRestaurant } from "@/web/admin";
import { requirePermission } from "@/web/session";
import { AddonGroupManager } from "@/components/admin/addon-group-manager";
import { MenuItemForm } from "@/components/admin/menu-item-form";
import { VariantManager } from "@/components/admin/variant-manager";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

interface EditItemPageProps {
  params: Promise<{ restaurantSlug: string; itemId: string }>;
}

export const metadata: Metadata = { title: "Edit item" };

export default async function EditMenuItemPage({ params }: EditItemPageProps) {
  const { restaurantSlug, itemId } = await params;
  const actor = await requirePermission("menu.manage", restaurantSlug);
  const restaurant = await getAdminRestaurant(restaurantSlug);
  const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };

  const [item, categories] = await Promise.all([
    getMenuItemForAdmin(restaurant.id, itemId, ctx),
    listCategoriesForAdmin(restaurant.id, ctx),
  ]);
  if (!item) notFound();

  return (
    <div className="space-y-8">
      <AdminPageHeader backHref={adminPath(restaurantSlug, "/menu")} backLabel="Back to menu" title={item.name} />

      <MenuItemForm item={item} categories={categories} />

      <section>
        <h2 className="mb-3 text-lg font-semibold">Variants</h2>
        <p className="mb-3 text-sm text-[var(--color-muted-ink)]">Optional. Leave empty if this item has one fixed price.</p>
        <VariantManager menuItemId={item.id} variants={item.variants} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Add-on groups</h2>
        <p className="mb-3 text-sm text-[var(--color-muted-ink)]">Optional extras a customer can add (e.g. toppings, sides).</p>
        <AddonGroupManager menuItemId={item.id} groups={item.addonGroups} />
      </section>
    </div>
  );
}
