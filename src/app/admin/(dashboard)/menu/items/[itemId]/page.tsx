import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getMenuItemForAdmin, listCategoriesForAdmin } from "@/server/services/menu-admin";
import { getAdminRestaurant } from "@/web/admin";
import { requirePermission } from "@/web/session";
import { AddonGroupManager } from "@/components/admin/addon-group-manager";
import { MenuItemForm } from "@/components/admin/menu-item-form";
import { VariantManager } from "@/components/admin/variant-manager";

interface EditItemPageProps {
  params: Promise<{ itemId: string }>;
}

export const metadata: Metadata = { title: "Edit item" };

export default async function EditMenuItemPage({ params }: EditItemPageProps) {
  const actor = await requirePermission("menu.manage");
  const restaurant = await getAdminRestaurant();
  const { itemId } = await params;
  const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };

  const [item, categories] = await Promise.all([
    getMenuItemForAdmin(restaurant.id, itemId, ctx),
    listCategoriesForAdmin(restaurant.id, ctx),
  ]);
  if (!item) notFound();

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/menu"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted-ink)] hover:text-[var(--color-ink)]"
        >
          <ArrowLeft className="size-4" aria-hidden /> Back to menu
        </Link>
        <h1 className="mt-2 text-2xl font-semibold">{item.name}</h1>
      </div>

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
