import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Search } from "lucide-react";
import { listCategories, listMenuItems } from "@/lib/db/menu";
import { EMPTY_CONTEXT } from "@/lib/db/pool";
import { ORDER_TYPE_LABELS, ORDER_TYPES, type OrderType } from "@/lib/contract/enums";
import { getStorefrontContext } from "@/lib/services/storefront";
import { MenuItemCard } from "@/components/storefront/menu-item-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { breadcrumbJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/storefront/json-ld";
import { cn } from "@/lib/utils";

interface MenuPageProps {
  params: Promise<{ restaurantSlug: string }>;
  searchParams: Promise<{ category?: string; q?: string; orderType?: string; sort?: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: MenuPageProps): Promise<Metadata> {
  const { restaurantSlug } = await params;
  try {
    const { restaurant } = await getStorefrontContext(restaurantSlug);
    return {
      title: "Menu",
      description: `Browse the full ${restaurant.name} menu — ${restaurant.cuisines.join(", ")}.`,
      alternates: { canonical: `/r/${restaurant.slug}/menu` },
    };
  } catch {
    return { title: "Menu" };
  }
}

/** Menu browsing: categories, search and ordering all run in the database. */
export default async function MenuPage({ params, searchParams }: MenuPageProps) {
  const { restaurantSlug } = await params;
  const { category, q, orderType, sort } = await searchParams;

  let context;
  try {
    context = await getStorefrontContext(restaurantSlug);
  } catch {
    notFound();
  }

  const { restaurant } = context;
  const activeOrderType: OrderType = ORDER_TYPES.includes(orderType as OrderType)
    ? (orderType as OrderType)
    : context.config.ordering.defaultOrderType;
  const search = (q ?? "").trim();

  const [categories, items] = await Promise.all([
    listCategories(restaurant.id, EMPTY_CONTEXT, { withCounts: true }),
    listMenuItems(
      restaurant.id,
      {
        ...(category ? { categorySlug: category } : {}),
        ...(search ? { search } : {}),
        orderBy: sort === "price_asc" ? "price_asc" : sort === "price_desc" ? "price_desc" : "menu",
        limit: 200,
      },
      EMPTY_CONTEXT,
    ),
  ]);

  const grouped = categories
    .map((entry) => ({ category: entry, items: items.filter((item) => item.categoryId === entry.id) }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="container-page py-10 md:py-14">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: restaurant.name, path: `/r/${restaurant.slug}` },
          { name: "Menu", path: `/r/${restaurant.slug}/menu` },
        ])}
      />

      <header className="max-w-2xl">
        <h1 className="text-3xl font-semibold md:text-4xl">Our menu</h1>
        <p className="mt-3 text-[var(--color-muted-ink)]">
          {categories.length} sections · {items.length} dishes available today
          {restaurant.settings.ordering.preparationTimeMinutes
            ? ` · average prep ${restaurant.settings.ordering.preparationTimeMinutes} minutes`
            : ""}
        </p>
      </header>

      <form className="mt-6 flex flex-col gap-3 sm:flex-row" action={`/r/${restaurant.slug}/menu`}>
        <input type="hidden" name="orderType" value={activeOrderType} />
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted-ink)]" aria-hidden />
          <Input
            name="q"
            defaultValue={search}
            placeholder="Search dishes, drinks or ingredients"
            aria-label="Search the menu"
            className="pl-9"
          />
        </div>
        <div className="flex gap-3">
          <select
            name="sort"
            defaultValue={sort ?? "menu"}
            aria-label="Sort menu"
            className="h-11 rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] px-3 text-sm"
          >
            <option value="menu">Menu order</option>
            <option value="price_asc">Price: low to high</option>
            <option value="price_desc">Price: high to low</option>
          </select>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </div>
      </form>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted-ink)]">Ordering</span>
        {ORDER_TYPES.filter((type) =>
          type === "delivery" ? restaurant.features.delivery : type === "pickup" ? restaurant.features.pickup : restaurant.features.dineIn,
        ).map((type) => (
          <Link
            key={type}
            href={`/r/${restaurant.slug}/menu?orderType=${type}${category ? `&category=${category}` : ""}${search ? `&q=${encodeURIComponent(search)}` : ""}`}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
              activeOrderType === type
                ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-[var(--color-brand-foreground)]"
                : "border-[var(--color-hairline)] bg-[var(--color-surface)] hover:border-[var(--color-brand)]",
            )}
          >
            {ORDER_TYPE_LABELS[type]}
          </Link>
        ))}
      </div>

      <nav aria-label="Menu categories" className="mt-5 -mx-1 flex snap-x gap-2 overflow-x-auto pb-2">
        <Link
          href={`/r/${restaurant.slug}/menu?orderType=${activeOrderType}${search ? `&q=${encodeURIComponent(search)}` : ""}`}
          className={cn(
            "snap-start whitespace-nowrap rounded-full px-4 py-2 text-sm",
            !category ? "bg-[color-mix(in_srgb,var(--color-brand)_12%,transparent)] text-[var(--color-brand)]" : "text-[var(--color-muted-ink)] hover:bg-[color-mix(in_srgb,var(--color-ink)_6%,transparent)]",
          )}
        >
          Everything
        </Link>
        {categories.map((entry) => (
          <Link
            key={entry.id}
            href={`/r/${restaurant.slug}/menu?category=${entry.slug}&orderType=${activeOrderType}${search ? `&q=${encodeURIComponent(search)}` : ""}`}
            className={cn(
              "snap-start whitespace-nowrap rounded-full px-4 py-2 text-sm",
              category === entry.slug
                ? "bg-[color-mix(in_srgb,var(--color-brand)_12%,transparent)] text-[var(--color-brand)]"
                : "text-[var(--color-muted-ink)] hover:bg-[color-mix(in_srgb,var(--color-ink)_6%,transparent)]",
            )}
          >
            {entry.name}
            <span className="ml-1.5 text-xs">{entry.itemCount ?? 0}</span>
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <div className="mt-16 rounded-[var(--radius-brand)] border border-dashed border-[var(--color-hairline)] p-12 text-center">
          <p className="text-lg font-medium">Nothing matched that search</p>
          <p className="mt-2 text-sm text-[var(--color-muted-ink)]">
            {search ? `We could not find “${search}”. ` : ""}Try another dish, or browse a category above.
          </p>
          <div className="mt-5">
            <Button asChild variant="outline">
              <Link href={`/r/${restaurant.slug}/menu`}>Clear filters</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-10 space-y-14">
          {grouped.map((group) => (
            <section key={group.category.id} id={group.category.slug} className="scroll-mt-28">
              <div className="flex flex-wrap items-baseline gap-3">
                <h2 className="text-2xl font-semibold">{group.category.name}</h2>
                {group.category.isFeatured ? <Badge variant="soft">Popular</Badge> : null}
                <span className="text-sm text-[var(--color-muted-ink)]">{group.items.length} items</span>
              </div>
              {group.category.description ? (
                <p className="mt-1.5 max-w-2xl text-sm text-[var(--color-muted-ink)]">{group.category.description}</p>
              ) : null}
              <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((item) => (
                  <li key={item.id} className="h-full">
                    <MenuItemCard
                      item={item}
                      restaurantSlug={restaurant.slug}
                      currencySymbol={restaurant.currencySymbol}
                      locale={restaurant.locale}
                      showPrepTime={context.config.ordering.showPrepTime}
                      orderType={activeOrderType}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
