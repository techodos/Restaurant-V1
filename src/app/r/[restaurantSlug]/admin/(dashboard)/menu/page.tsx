import type { Metadata } from "next";
import { adminPath } from "@/shared/utils";
import Image from "next/image";
import Link from "next/link";
import { resolveMenuImage } from "@/web/media";
import { Plus, UtensilsCrossed } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listCategoriesForAdmin, listMenuItemsForAdmin } from "@/server/services/menu-admin";
import { formatMoney } from "@/shared/money";
import { getAdminRestaurant } from "@/web/admin";
import { requirePermission } from "@/web/session";
import { CategoryManager } from "@/components/admin/category-manager";
import { ItemRowActions } from "@/components/admin/item-row-actions";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatusTabs } from "@/components/admin/admin-status-tabs";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Menu" };

interface MenuAdminPageProps {
  params: Promise<{ restaurantSlug: string }>;
  searchParams: Promise<{ category?: string }>;
}

export default async function AdminMenuPage({ params, searchParams }: MenuAdminPageProps) {
  const { restaurantSlug } = await params;
  const actor = await requirePermission("menu.view", restaurantSlug);
  const restaurant = await getAdminRestaurant(restaurantSlug);
  const { category } = await searchParams;
  const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };

  // side by side (they were one after the other)
  const [categories, items] = await Promise.all([
    listCategoriesForAdmin(restaurant.id, ctx),
    listMenuItemsForAdmin(restaurant.id, category ? { categoryId: category } : {}, ctx),
  ]);
  const canManage = actor.permissions.includes("menu.manage");

  return (
    <div className="space-y-8">
      <AdminPageHeader
        title="Menu"
        description={`${categories.length} categories · ${items.length} items`}
        actions={
          canManage ? (
            <Button asChild>
              <Link href={adminPath(restaurantSlug, "/menu/items/new")}>
                <Plus className="size-4" aria-hidden /> Add item
              </Link>
            </Button>
          ) : null
        }
      />

      <section>
        <h2 className="mb-3 text-lg font-semibold">Categories</h2>
        {canManage ? (
          <CategoryManager categories={categories} />
        ) : (
          <ul className="flex flex-wrap gap-2">
            {categories.map((entry) => (
              <li key={entry.id} className="rounded-full border border-[var(--color-hairline)] px-3 py-1 text-sm">
                {entry.name}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Items</h2>

        <div className="mb-4">
          <AdminStatusTabs
            label="Category"
            active={category ?? ""}
            options={[{ key: "", label: "All" }, ...categories.map((entry) => ({ key: entry.id, label: entry.name }))]}
            linkFor={(key) => (key ? `${adminPath(restaurantSlug)}/menu?category=${key}` : adminPath(restaurantSlug, "/menu"))}
          />
        </div>

        <Card className="overflow-hidden">
          {items.length === 0 ? (
            <AdminEmptyState icon={UtensilsCrossed} title="No items in this category yet." />
          ) : (
            <div className="overflow-x-auto"><table className="tabular w-full min-w-[42rem] text-sm">
              <thead className="border-b border-[var(--color-hairline)] bg-[color-mix(in_srgb,var(--color-ink)_3%,transparent)] text-left text-xs font-medium text-[var(--color-muted-ink)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Item</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Price</th>
                  {canManage ? <th className="px-4 py-3 font-medium text-right">Actions</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-hairline)]">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-[color-mix(in_srgb,var(--color-ink)_3%,transparent)]">
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-3">
                        {/* the dish photo: staff scan a menu by picture as much as by name */}
                        <span className="relative size-10 shrink-0 overflow-hidden rounded-[var(--radius-brand)] bg-[var(--steel-2)]">
                          {resolveMenuImage(item.imageUrl, item.categorySlug ?? null) ? (
                            <Image src={resolveMenuImage(item.imageUrl, item.categorySlug ?? null)!} alt="" fill sizes="40px" className="object-cover" />
                          ) : null}
                        </span>
                        {canManage ? (
                          <Link href={`${adminPath(restaurantSlug)}/menu/items/${item.id}`} className="font-medium hover:text-[var(--color-brand)] hover:underline">
                            {item.name}
                          </Link>
                        ) : (
                          <span className="font-medium">{item.name}</span>
                        )}
                        {item.isBuffetPackage ? <Badge variant="soft">Buffet</Badge> : null}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted-ink)]">{item.categoryName}</td>
                    <td className="px-4 py-3 font-medium">
                      {formatMoney(item.hasVariants ? item.priceFrom : item.basePrice, { currency: restaurant.currency })}
                      {item.hasVariants ? <span className="text-[var(--color-muted-ink)]"> from</span> : null}
                    </td>
                    {canManage ? (
                      <td className="px-4 py-3">
                        <ItemRowActions itemId={item.id} isAvailable={item.isAvailable} />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </Card>
      </section>
    </div>
  );
}
