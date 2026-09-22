import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { listCategoriesForAdmin } from "@/server/services/menu-admin";
import { getAdminRestaurant } from "@/web/admin";
import { requirePermission } from "@/web/session";
import { MenuItemForm } from "@/components/admin/menu-item-form";

export const metadata: Metadata = { title: "New item" };

export default async function NewMenuItemPage() {
  const actor = await requirePermission("menu.manage");
  const restaurant = await getAdminRestaurant();
  const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
  const categories = await listCategoriesForAdmin(restaurant.id, ctx);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/menu"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted-ink)] hover:text-[var(--color-ink)]"
        >
          <ArrowLeft className="size-4" aria-hidden /> Back to menu
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">New item</h1>
      </div>
      {categories.length === 0 ? (
        <p className="text-sm text-[var(--color-muted-ink)]">Add a category first.</p>
      ) : (
        <MenuItemForm categories={categories} />
      )}
    </div>
  );
}
