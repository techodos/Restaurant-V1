import type { Metadata } from "next";
import { adminPath } from "@/shared/utils";
import Image from "next/image";
import Link from "next/link";
import { resolveMenuImage } from "@/web/media";
import { Plus, UtensilsCrossed } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getLocationItemOverridesForAdmin, listCategoriesForAdmin, listMenuItemsForAdmin } from "@/server/services/menu-admin";
import { getLocations } from "@/server/services/restaurants";
import { formatMoney } from "@/shared/money";
import { getAdminRestaurant } from "@/web/admin";
import { requirePermission } from "@/web/session";
import { CategoryManager } from "@/components/admin/category-manager";
import { ItemRowActions } from "@/components/admin/item-row-actions";
import { BranchItemToggle } from "@/components/admin/branch-menu-controls";
import { BranchFilter } from "@/components/admin/branch-filter";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatusTabs } from "@/components/admin/admin-status-tabs";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Menu" };

interface MenuAdminPageProps {
  params: Promise<{ restaurantSlug: string }>;
  searchParams: Promise<{ category?: string; location?: string }>;
}

export default async function AdminMenuPage({ params, searchParams }: MenuAdminPageProps) {
  const { restaurantSlug } = await params;
  const actor = await requirePermission("menu.view", restaurantSlug);
  const restaurant = await getAdminRestaurant(restaurantSlug);
  const { category, location } = await searchParams;
  const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };

  // side by side (they were one after the other)
  const [categories, items] = await Promise.all([
    listCategoriesForAdmin(restaurant.id, ctx),
    listMenuItemsForAdmin(restaurant.id, category ? { categoryId: category } : {}, ctx),
  ]);
  const canManage = actor.permissions.includes("menu.manage");

  // Multi-branch ordering (features.BranchingFeature): the menu is shared, a branch only switches items
  // off. `?location=<id>` (the same branch filter as orders/payments/reservations) turns the item list into
  // that branch's availability view.
  const branches = restaurant.features.BranchingFeature ? await getLocations(restaurant.id, { activeOnly: true }) : [];
  const branchMode = branches.length > 1;
  const selectedBranch = branchMode ? (branches.find((entry) => entry.id === location) ?? null) : null;
  const overrides = selectedBranch ? await getLocationItemOverridesForAdmin(selectedBranch.id, ctx) : null;
  const menuHref = (next: { category?: string }) => {
    const query = new URLSearchParams();
    if (next.category) query.set("category", next.category);
    if (selectedBranch) query.set("location", selectedBranch.id);
    const text = query.toString();
    return `${adminPath(restaurantSlug, "/menu")}${text ? `?${text}` : ""}`;
  };

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

      {branchMode ? (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[var(--radius-card)] border border-[var(--color-hairline)] bg-[var(--color-surface)] px-4 py-3">
          <BranchFilter locations={branches} active={selectedBranch?.id ?? null} basePath={adminPath(restaurantSlug, "/menu")} params={{ category }} />
          <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-[var(--color-muted-ink)]">
            {selectedBranch
              ? `Categories, items and prices are shared by every branch. Switch an item off below to stop selling it at ${selectedBranch.name} only.`
              : "Categories, items and prices are shared by every branch. Choose a branch to manage what it sells."}
          </p>
        </div>
      ) : null}

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
            linkFor={(key) => menuHref(key ? { category: key } : {})}
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
                  {canManage ? (
                    <th className="px-4 py-3 text-right font-medium">{selectedBranch ? `At ${selectedBranch.name}` : "Actions"}</th>
                  ) : null}
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
                        {selectedBranch ? (
                          <BranchItemToggle
                            key={`${selectedBranch.id}:${item.id}`}
                            menuItemId={item.id}
                            locationId={selectedBranch.id}
                            branchName={selectedBranch.name}
                            available={overrides?.get(item.id) ?? true}
                            disabled={!item.isAvailable}
                          />
                        ) : (
                          <ItemRowActions itemId={item.id} isAvailable={item.isAvailable} />
                        )}
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
