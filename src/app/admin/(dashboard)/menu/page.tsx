import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listCategoriesForAdmin, listMenuItemsForAdmin } from "@/server/services/menu-admin";
import { formatMoney } from "@/shared/money";
import { cn } from "@/shared/utils";
import { getAdminRestaurant } from "@/web/admin";
import { requirePermission } from "@/web/session";
import { CategoryManager } from "@/components/admin/category-manager";
import { ItemRowActions } from "@/components/admin/item-row-actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Menu" };

interface MenuAdminPageProps {
  searchParams: Promise<{ category?: string }>;
}

export default async function AdminMenuPage({ searchParams }: MenuAdminPageProps) {
  const actor = await requirePermission("menu.view");
  const restaurant = await getAdminRestaurant();
  const { category } = await searchParams;
  const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };

  const categories = await listCategoriesForAdmin(restaurant.id, ctx);
  const items = await listMenuItemsForAdmin(restaurant.id, category ? { categoryId: category } : {}, ctx);
  const canManage = actor.permissions.includes("menu.manage");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">Menu</h1>
          <p className="mt-1 text-[var(--color-muted-ink)]">
            {categories.length} categories · {items.length} items
          </p>
        </div>
        {canManage ? (
          <Button asChild>
            <Link href="/admin/menu/items/new">
              <Plus className="size-4" aria-hidden /> Add item
            </Link>
          </Button>
        ) : null}
      </div>

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

        <div className="-mx-1 mb-4 flex snap-x gap-2 overflow-x-auto pb-1">
          <Link
            href="/admin/menu"
            className={cn(
              "snap-start whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm transition-colors",
              !category
                ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-[var(--color-brand-foreground)]"
                : "border-[var(--color-hairline)] bg-[var(--color-surface)] hover:border-[var(--color-brand)]",
            )}
          >
            All
          </Link>
          {categories.map((entry) => (
            <Link
              key={entry.id}
              href={`/admin/menu?category=${entry.id}`}
              className={cn(
                "snap-start whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                category === entry.id
                  ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-[var(--color-brand-foreground)]"
                  : "border-[var(--color-hairline)] bg-[var(--color-surface)] hover:border-[var(--color-brand)]",
              )}
            >
              {entry.name}
            </Link>
          ))}
        </div>

        <Card className="overflow-hidden">
          {items.length === 0 ? (
            <p className="p-8 text-center text-sm text-[var(--color-muted-ink)]">No items in this category yet.</p>
          ) : (
            <table className="tabular w-full text-sm">
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
                    <td className="px-4 py-3">
                      {canManage ? (
                        <Link href={`/admin/menu/items/${item.id}`} className="font-medium text-[var(--color-brand)] hover:underline">
                          {item.name}
                        </Link>
                      ) : (
                        <span className="font-medium">{item.name}</span>
                      )}
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
            </table>
          )}
        </Card>
      </section>
    </div>
  );
}
