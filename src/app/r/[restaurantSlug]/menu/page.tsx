import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { ConfiguredPage, configuredPageMetadata, type PageHeading } from "@/components/storefront/configured-page";
import type { StorefrontContext } from "@/shared/contract/models";
import { enabledOrderTypes } from "@/shared/ordering";
import { ORDER_TYPE_LABELS, ORDER_TYPES, type OrderType } from "@/shared/contract/enums";
import { getStorefrontContext } from "@/web/storefront";
import { resolveImage, resolveMenuImage } from "@/web/media";
import { DishTile } from "@/components/storefront/dish-tile";
import { PageHero } from "@/components/storefront/page-hero";
import { StationNav } from "@/components/storefront/station-nav";
import { Button } from "@/components/ui/button";
import { breadcrumbJsonLd } from "@/web/seo";
import { JsonLd } from "@/components/storefront/json-ld";
import { cn } from "@/shared/utils";
import { getMenuCategories, searchMenu } from "@/server/services/catalog";

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
      ...(await configuredPageMetadata(restaurant.id, "menu", {
        title: "Menu",
        description: `Browse the full ${restaurant.name} menu: ${restaurant.cuisines.join(", ")}.`,
      })),
      alternates: { canonical: `/r/${restaurant.slug}/menu` },
    };
  } catch {
    return { title: "Menu" };
  }
}

/** Menu browsing: categories, search and ordering all run in the database. */
export default async function MenuPage({ params, searchParams }: MenuPageProps) {
  const { restaurantSlug } = await params;
  const filters = await searchParams;
  return (
    <ConfiguredPage
      restaurantSlug={restaurantSlug}
      pageSlug="menu"
      render={(context, heading) => renderMenu(context, heading, filters)}
    />
  );
}

/**
 * The menu as an editorial book. A cinematic menu hero carries search, sort and the order type; a sticky
 * category rail follows the reader; then every category is its own chapter, alternating paper and night:
 * paper chapters open with a photograph beside the category's name and list their dishes as printed-menu
 * lines, night chapters set the name large and show the dishes as photo cards. Search, sort, `?category=`
 * and the order type still run through the database exactly as before; a search shows one flat result list.
 */
async function renderMenu(
  context: StorefrontContext,
  heading: PageHeading,
  { category, q, orderType, sort }: Awaited<MenuPageProps["searchParams"]>,
) {
  const { restaurant } = context;
  const activeOrderType: OrderType = ORDER_TYPES.includes(orderType as OrderType)
    ? (orderType as OrderType)
    : context.config.ordering.defaultOrderType;
  const search = (q ?? "").trim();
  const base = `/r/${restaurant.slug}/menu`;
  const filtered = Boolean(search || category);

  const [categories, items] = await Promise.all([
    getMenuCategories(restaurant.id, { withCounts: true }),
    searchMenu(restaurant.id, {
      ...(category ? { categorySlug: category } : {}),
      ...(search ? { search } : {}),
      orderBy: sort === "price_asc" ? "price_asc" : sort === "price_desc" ? "price_desc" : "menu",
      limit: 200,
    }),
  ]);

  const grouped = categories
    .map((entry) => ({ category: entry, items: items.filter((item) => item.categoryId === entry.id) }))
    .filter((group) => group.items.length > 0);
  const stations = grouped.map((group) => ({ slug: group.category.slug, name: group.category.name, count: group.items.length }));
  const orderTypes = enabledOrderTypes(restaurant.features);
  const keep = (extra: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { orderType: activeOrderType, q: search || undefined, sort: sort && sort !== "menu" ? sort : undefined, category, ...extra };
    for (const [key, value] of Object.entries(merged)) if (value) params.set(key, value);
    const query = params.toString();
    return query ? `${base}?${query}` : base;
  };
  // A category's own photo, else the photo of one of its dishes (real data, never stock).
  const chapterPhoto = (group: (typeof grouped)[number]) => {
    const own = resolveImage(group.category.imageUrl);
    if (own) return own;
    for (const item of group.items) {
      const photo = resolveMenuImage(item.imageUrl, group.category.slug);
      if (photo) return photo;
    }
    return null;
  };
  const heroImage = resolveImage(restaurant.coverUrl) ?? (grouped[0] ? chapterPhoto(grouped[0]) : null);
  const tile = (item: (typeof items)[number], layout: "card" | "row") => (
    <DishTile
      item={item}
      layout={layout}
      restaurantSlug={restaurant.slug}
      currencySymbol={restaurant.currencySymbol}
      locale={restaurant.locale}
      showPrepTime={context.config.ordering.showPrepTime}
      orderType={activeOrderType}
    />
  );
  const dishes = (count: number) => `${count} dish${count === 1 ? "" : "es"}`;

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: restaurant.name, path: `/r/${restaurant.slug}` },
          { name: "Menu", path: base },
        ])}
      />

      <PageHero
        overlay={heading.leading}
        image={heroImage}
        eyebrow={restaurant.cuisines.length ? `${restaurant.cuisines.slice(0, 2).join(" · ")} menu` : "Our menu"}
        title={heading.title ?? "The Menu"}
        subtitle={
          heading.subtitle ??
          `${grouped.length} categories, ${items.length} dishes today${
            restaurant.settings.ordering.preparationTimeMinutes
              ? `, around ${restaurant.settings.ordering.preparationTimeMinutes} minutes to prepare`
              : ""
          }.`
        }
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <form
            action={base}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-control)] border border-white/20 bg-black/30 py-1.5 pl-5 pr-1.5 backdrop-blur-md transition-colors focus-within:border-white/60 lg:max-w-xl"
          >
            <input type="hidden" name="orderType" value={activeOrderType} />
            {category ? <input type="hidden" name="category" value={category} /> : null}
            <Search className="size-[18px] shrink-0 text-white/70" aria-hidden />
            <input
              name="q"
              type="search"
              defaultValue={search}
              placeholder="Search dishes or ingredients"
              aria-label="Search the menu"
              className="h-10 min-w-0 flex-1 bg-transparent text-[16px] text-white outline-none placeholder:text-white/55"
            />
            <select
              name="sort"
              defaultValue={sort ?? "menu"}
              aria-label="Sort"
              className="hidden h-10 cursor-pointer rounded-[var(--radius-control)] bg-white/10 px-3 text-xs font-medium text-white outline-none sm:block [&>option]:text-black"
            >
              <option value="menu">Menu order</option>
              <option value="price_asc">Price, low first</option>
              <option value="price_desc">Price, high first</option>
            </select>
            <Button type="submit" size="sm" className="h-10">
              Search
            </Button>
          </form>

          {orderTypes.length > 1 ? (
            <div
              role="group"
              aria-label="Order type"
              className="flex rounded-[var(--radius-control)] border border-white/20 bg-black/30 p-1 backdrop-blur-md"
            >
              {orderTypes.map((type) => (
                <Link
                  key={type}
                  href={keep({ orderType: type })}
                  scroll={false}
                  aria-current={activeOrderType === type ? "true" : undefined}
                  className={cn(
                    "flex-1 whitespace-nowrap rounded-[var(--radius-control)] px-4 py-2 text-center text-[13px] font-semibold transition-[background-color,color] duration-200 lg:flex-none",
                    activeOrderType === type ? "bg-white text-[#111]" : "text-white/75 hover:text-white",
                  )}
                >
                  {ORDER_TYPE_LABELS[type]}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </PageHero>

      {items.length === 0 ? (
        <section className="tone-paper section-y">
          <div className="container-narrow text-center">
            <p className="display-2">Nothing on the menu matches that</p>
            <p className="lede mx-auto mt-3">
              {search ? `No dish matches "${search}". ` : ""}Try another word, or browse every category.
            </p>
            <Button asChild variant="outline" className="mt-6">
              <Link href={keep({ q: undefined, category: undefined })}>Show the full menu</Link>
            </Button>
          </div>
        </section>
      ) : filtered ? (
        <section className="tone-paper section-y">
          <div className="container-page">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--rule)] pb-6">
              <p className="display-3">
                {dishes(items.length)}
                {search ? <> for &ldquo;{search}&rdquo;</> : null}
                {category ? <> in {categories.find((entry) => entry.slug === category)?.name ?? category}</> : null}
              </p>
              <Link href={keep({ q: undefined, category: undefined })} className="link-arrow">
                <X aria-hidden />
                Clear and show the full menu
              </Link>
            </div>
            <ul className="section-body grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5 xl:grid-cols-4">
              {items.map((item) => (
                <li key={item.id}>{tile(item, "card")}</li>
              ))}
            </ul>
          </div>
        </section>
      ) : (
        <>
          <div className="tone-paper sticky top-[var(--header-h,4.25rem)] z-30 border-b border-[var(--rule)] bg-[color-mix(in_srgb,var(--color-canvas)_92%,transparent)] backdrop-blur-lg">
            <div className="container-page">
              <StationNav stations={stations} variant="rail" />
            </div>
          </div>

          {grouped.map((group, index) => {
            const night = index % 2 === 1;
            const photo = chapterPhoto(group);
            // every other paper chapter puts its photograph on the right
            const flip = index % 4 === 2;
            return (
              <section
                key={group.category.id}
                id={group.category.slug}
                aria-labelledby={`${group.category.slug}-title`}
                className={cn(night ? "tone-night" : "tone-paper", "section-y scroll-mt-[calc(var(--header-h,4.25rem)+3rem)]")}
              >
                <div className="container-page">
                  {night ? (
                    <>
                      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 border-b border-[var(--rule)] pb-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-end lg:gap-12">
                        <div>
                          <p className="eyebrow mb-5">{dishes(group.items.length)}</p>
                          <h2 id={`${group.category.slug}-title`} className="display-1">
                            {group.category.name}
                          </h2>
                        </div>
                        {group.category.description ? <p className="lede lg:justify-self-end">{group.category.description}</p> : null}
                      </div>
                      <ul className="section-body grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5 xl:grid-cols-4">
                        {group.items.map((item) => (
                          <li key={item.id}>{tile(item, "card")}</li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-12">
                      <div className={cn("lg:sticky lg:top-[calc(var(--header-h,4.25rem)+5rem)] lg:self-start", flip && "lg:order-2")}>
                        {photo ? (
                          <div className="relative aspect-[16/10] overflow-hidden rounded-[var(--radius-card)] bg-[var(--steel-2)] lg:aspect-[4/5]">
                            <Image src={photo} alt="" fill sizes="(min-width: 1024px) 38vw, 100vw" className="reveal-plate object-cover" />
                          </div>
                        ) : null}
                        <p className={cn("eyebrow mb-3", photo && "mt-6")}>{dishes(group.items.length)}</p>
                        <h2 id={`${group.category.slug}-title`} className="display-1">
                          {group.category.name}
                        </h2>
                        {group.category.description ? <p className="lede mt-3">{group.category.description}</p> : null}
                      </div>
                      <ul className={cn("divide-y divide-[var(--rule)] border-t border-[var(--rule-strong)]", flip && "lg:order-1")}>
                        {group.items.map((item) => (
                          <li key={item.id}>{tile(item, "row")}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </>
      )}
    </>
  );
}
