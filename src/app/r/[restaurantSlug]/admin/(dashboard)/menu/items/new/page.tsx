import type { Metadata } from "next";
import { adminPath } from "@/shared/utils";
import { listCategoriesForAdmin } from "@/server/services/menu-admin";
import { getAdminRestaurant } from "@/web/admin";
import { requireAdminPage } from "@/web/session";
import { MenuItemForm } from "@/components/admin/menu-item-form";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const metadata: Metadata = { title: "New item" };

export default async function NewMenuItemPage({ params }: { params: Promise<{ restaurantSlug: string }> }) {
  const { restaurantSlug } = await params;
  const actor = await requireAdminPage("menu.manage", restaurantSlug, { restaurantWide: true }); // the shared menu: owner/admin
  const restaurant = await getAdminRestaurant(restaurantSlug);
  const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
  const categories = await listCategoriesForAdmin(restaurant.id, ctx);

  return (
    <div className="space-y-6">
      <AdminPageHeader backHref={adminPath(restaurantSlug, "/menu")} backLabel="Back to menu" title="New item" />
      {categories.length === 0 ? (
        <p className="text-sm text-[var(--color-muted-ink)]">Add a category first.</p>
      ) : (
        <MenuItemForm categories={categories} />
      )}
    </div>
  );
}
