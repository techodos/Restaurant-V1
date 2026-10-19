import type { Metadata } from "next";
import Link from "next/link";
import { FolderPlus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { adminPath } from "@/shared/utils";
import { listCategoriesForAdmin } from "@/server/services/menu-admin";
import { getAdminRestaurant } from "@/web/admin";
import { requireAdminPage } from "@/web/session";
import { MenuItemForm } from "@/components/admin/menu-item-form";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { instanceRestaurantSlug } from "@/web/instance";

export const metadata: Metadata = { title: "New item" };

export default async function NewMenuItemPage() {
  const restaurantSlug = instanceRestaurantSlug();
  const actor = await requireAdminPage("menu.manage", restaurantSlug, { restaurantWide: true }); // the shared menu: owner/admin
  const restaurant = await getAdminRestaurant(restaurantSlug);
  const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
  const categories = await listCategoriesForAdmin(restaurant.id, ctx);

  return (
    <div className="space-y-6">
      <AdminPageHeader backHref={adminPath("/menu")} backLabel="Back to menu" title="New item" />
      {categories.length === 0 ? (
        <Card>
          <AdminEmptyState
            icon={FolderPlus}
            title="Add a category first, then create items inside it."
            action={
              <Button asChild size="sm" variant="outline">
                <Link href={adminPath("/menu")}>Go to categories</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <MenuItemForm categories={categories} />
      )}
    </div>
  );
}
