import type { Metadata } from "next";
import { adminPath } from "@/shared/utils";
import Image from "next/image";
import Link from "next/link";
import { resolveMenuImage } from "@/web/media";
import { ChevronDown, Info, Pencil, Plus, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getLocationItemOverridesForAdmin, listBranchUnavailableItemsForAdmin, listCategoriesForAdmin, listMenuItemsForAdmin } from "@/server/services/menu-admin";
import { getLocations } from "@/server/services/restaurants";
import { formatMoney } from "@/shared/money";
import { getAdminBranchScope, getAdminRestaurant } from "@/web/admin";
import { isRestaurantWide } from "@/server/auth/branch-scope";
import { requireAdminPage } from "@/web/session";
import { CategoryManager } from "@/components/admin/category-manager";
import { ItemRowActions } from "@/components/admin/item-row-actions";
import { BranchItemToggle } from "@/components/admin/branch-menu-controls";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { ListFilter } from "@/components/admin/list-filter";
import { StatusPill } from "@/components/admin/admin-ui";
import { instanceRestaurantSlug } from "@/web/instance";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Menu" };

interface MenuAdminPageProps {
  searchParams: Promise<{ category?: string }>;
}

export default async function AdminMenuPage({ searchParams }: MenuAdminPageProps) {
  const restaurantSlug = instanceRestaurantSlug();
  const actor = await requireAdminPage("menu.view", restaurantSlug);
  const [restaurant, scope] = await Promise.all([getAdminRestaurant(restaurantSlug), getAdminBranchScope(restaurantSlug)]);
  const { category } = await searchParams;
  const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };

  // Categories, items and prices are shared by every branch: owner/admin edit them. A branch only switches
  // items off (menu_item_location_overrides) — the one menu change a branch manager makes, for their branch.
  const canManage = actor.permissions.includes("menu.manage") && isRestaurantWide(actor);
  const canToggleBranch = actor.permissions.includes("menu.manage");

  // With 2+ branches the list is the availability of the branch in scope: the one chosen in the header
  // (owner/admin) or the member's own. "All branches" (scope.choices set, no current) asks per branch.
  // Every read decidable from the scope runs in ONE parallel round (they used to wait on each other).
  const allBranchesView = scope.choices.length > 1 && !scope.current;
  const [categories, items, branches, overrides, offByBranch] = await Promise.all([
    listCategoriesForAdmin(restaurant.id, ctx),
    listMenuItemsForAdmin(restaurant.id, category ? { categoryId: category } : {}, ctx),
    // locked staff have no `choices`; everyone else's are already the active branches
    scope.locked ? getLocations(restaurant.id, { activeOnly: true }) : scope.choices,
    scope.current && (scope.locked || scope.choices.length > 1) ? getLocationItemOverridesForAdmin(scope.current.id, ctx) : null,
    allBranchesView && canManage ? listBranchUnavailableItemsForAdmin(restaurant.id, ctx) : null,
  ]);
  const branchMode = branches.length > 1;
  const selectedBranch = branchMode ? scope.current : null;
  const branchOptions = branches.map((branch) => ({ id: branch.id, name: branch.name }));
  // location id -> Set of item ids: O(1) per row instead of scanning each branch's array
  const offSets = offByBranch ? new Map(Object.entries(offByBranch).map(([id, itemIds]) => [id, new Set(itemIds)])) : null;
  const showActions = selectedBranch ? canToggleBranch : canManage;
  const menuHref = (next: { category?: string }) => {
    const query = new URLSearchParams();
    if (next.category) query.set("category", next.category);
    const text = query.toString();
    return `${adminPath("/menu")}${text ? `?${text}` : ""}`;
  };
  const activeCategory = categories.find((entry) => entry.id === category) ?? null;
  const totalItems = categories.reduce((sum, entry) => sum + (entry.itemCount ?? 0), 0);

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Menu"
        description={`${categories.length} categories · ${totalItems || items.length} items${branchMode ? " · shared by every branch" : ""}`}
        actions={
          canManage ? (
            <Button asChild>
              <Link href={adminPath("/menu/items/new")}>
                <Plus className="size-4" aria-hidden /> Add item
              </Link>
            </Button>
          ) : null
        }
      />

      {branchMode ? (
        <p className="flex items-start gap-2.5 rounded-[var(--radius-card)] border border-[color-mix(in_srgb,var(--color-info)_22%,var(--color-hairline))] bg-[color-mix(in_srgb,var(--color-info)_6%,var(--color-surface))] px-4 py-3 text-[13px] leading-relaxed">
          <Info className="mt-0.5 size-4 shrink-0 text-[var(--color-info)]" aria-hidden />
          <span>
            {selectedBranch
              ? `Categories, items and prices are shared by every branch.${canToggleBranch ? ` Switch an item off below to stop selling it at ${selectedBranch.name} only.` : ""}${canToggleBranch && !canManage ? " Only the owner or an administrator can change the shared menu." : ""}`
              : "Categories, items and prices are shared by every branch. Choose a branch in the header to manage what it sells."}
          </span>
        </p>
      ) : null}

      {/* phones/tablets: categories as a swipe row of chips, management folded away below them */}
      <div className="space-y-3 lg:hidden">
        <nav aria-label="Categories" className="scrollbar-none -mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
          <ul className="flex min-w-max gap-2 pb-1">
            {[{ id: null as string | null, name: "All items", itemCount: totalItems || items.length }, ...categories].map((entry) => {
              const on = (entry.id ?? null) === (category ?? null);
              return (
                <li key={entry.id ?? "all"}>
                  <Link
                    href={menuHref({ category: entry.id ?? undefined })}
                    prefetch={false}
                    aria-current={on ? "page" : undefined}
                    className={
                      on
                        ? "inline-flex min-h-10 items-center gap-2 rounded-full bg-[var(--color-brand)] px-4 text-[14px] font-semibold text-[var(--color-brand-foreground)] shadow-[var(--shadow-brand)]"
                        : "inline-flex min-h-10 items-center gap-2 rounded-full bg-[var(--color-surface)] px-4 text-[14px] font-medium text-[var(--color-ink)] ring-1 ring-inset ring-[var(--admin-line,var(--color-hairline))] transition-colors hover:ring-[var(--color-brand)]"
                    }
                  >
                    {entry.name}
                    <span className={on ? "tabular text-[12px] opacity-80" : "tabular text-[12px] text-[var(--color-muted-ink)]"}>{entry.itemCount ?? 0}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        {canManage ? (
          <details className="group surface-card overflow-hidden">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-[14px] font-semibold [&::-webkit-details-marker]:hidden">
              Manage categories
              <ChevronDown className="size-4 text-[var(--color-muted-ink)] transition-transform group-open:rotate-180" aria-hidden />
            </summary>
            <div className="border-t border-[var(--admin-line,var(--color-hairline))] p-2">
              <CategoryManager categories={categories} activeId={category ?? null} baseHref={menuHref({})} totalItems={totalItems || undefined} canManage={canManage} />
            </div>
          </details>
        ) : null}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <Card className="hidden p-2 lg:sticky lg:top-24 lg:block">
          <p className="px-2.5 pb-2 pt-1.5 label-caps font-semibold text-[var(--color-muted-ink)]">Categories</p>
          <CategoryManager
            categories={categories}
            activeId={category ?? null}
            baseHref={menuHref({})}
            totalItems={totalItems || undefined}
            canManage={canManage}
          />
        </Card>

        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-[var(--color-hairline)] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold">
              {activeCategory?.name ?? "All items"}
              <span className="tabular rounded-full bg-[var(--tint-strong)] px-2 py-0.5 text-xs font-semibold text-[var(--color-muted-ink)]">{items.length}</span>
            </h2>
            {items.length > 0 ? (
              <div className="sm:w-64">
                <ListFilter targetId="menu-items" label="Search items" placeholder="Search items" />
              </div>
            ) : null}
          </div>
          {items.length === 0 ? (
            <AdminEmptyState
              icon={UtensilsCrossed}
              title="No items in this category yet."
              action={
                canManage ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={adminPath("/menu/items/new")}>
                      <Plus className="size-4" aria-hidden /> Add item
                    </Link>
                  </Button>
                ) : null
              }
            />
          ) : (
            <ul id="menu-items" className="divide-y divide-[var(--color-hairline)]">
              {items.map((item) => {
                const image = resolveMenuImage(item.imageUrl, item.categorySlug ?? null);
                const editHref = `${adminPath()}/menu/items/${item.id}`;
                const offHere = selectedBranch ? overrides?.get(item.id) === false || !item.isAvailable : !item.isAvailable;
                return (
                  <li
                    key={item.id}
                    data-filter-text={`${item.name} ${item.categoryName ?? ""}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-[color-mix(in_srgb,var(--color-brand)_3.5%,transparent)] sm:px-5"
                  >
                    {/* the dish photo: staff scan a menu by picture as much as by name */}
                    <span className={`relative size-14 shrink-0 overflow-hidden rounded-xl bg-[var(--steel-2)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--color-ink)_8%,transparent)] ${offHere ? "opacity-50 grayscale" : ""}`}>
                      {image ? <Image src={image} alt="" fill sizes="56px" className="object-cover" /> : null}
                    </span>
                    {/* min width: on a phone the name keeps its line and price + controls wrap below it */}
                    <div className="min-w-[11rem] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {canManage ? (
                          <Link href={editHref} prefetch={false} className="truncate text-[15px] font-semibold hover:text-[var(--color-brand)] hover:underline">
                            {item.name}
                          </Link>
                        ) : (
                          <span className="truncate font-medium">{item.name}</span>
                        )}
                        {item.isFeatured ? <StatusPill tone="brand" dot={false}>Featured</StatusPill> : null}
                        {item.isBuffetPackage ? <StatusPill tone="info" dot={false}>Buffet</StatusPill> : null}
                      </div>
                      <p className="text-xs text-[var(--color-muted-ink)]">{item.categoryName}</p>
                    </div>
                    <p className="tabular whitespace-nowrap text-sm font-semibold sm:w-36 sm:text-right">
                      {item.hasVariants ? <span className="mr-1 text-xs font-normal text-[var(--color-muted-ink)]">from</span> : null}
                      {formatMoney(item.hasVariants ? item.priceFrom : item.basePrice, { currency: restaurant.currency })}
                    </p>
                    {showActions ? (
                      <div className="ml-auto flex items-center gap-1">
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
                          <ItemRowActions
                            itemId={item.id}
                            isAvailable={item.isAvailable}
                            itemName={item.name}
                            branches={offSets ? branchOptions : undefined}
                            offAt={offSets ? branchOptions.filter((branch) => offSets.get(branch.id)?.has(item.id)).map((branch) => branch.id) : undefined}
                          />
                        )}
                        {canManage ? (
                          <Button asChild size="sm" variant="ghost" className="text-[var(--color-muted-ink)]">
                            <Link href={editHref} prefetch={false} aria-label={`Edit ${item.name}`}>
                              <Pencil className="size-3.5" aria-hidden /> <span className="hidden xl:inline">Edit</span>
                            </Link>
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
