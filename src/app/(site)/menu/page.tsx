import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { X } from "lucide-react";
import { ConfiguredPage, configuredPageMetadata, type PageHeading } from "@/components/storefront/configured-page";
import type { StorefrontContext } from "@/shared/contract/models";
import { ORDER_TYPES, type OrderType } from "@/shared/contract/enums";
import { getBranching, getStorefrontContext, readTray } from "@/web/storefront";
import { resolveImage, resolveMenuImage } from "@/web/media";
import { MenuOrderTypeSync } from "@/components/storefront/branch-bar";
import { DishTile } from "@/components/storefront/dish-tile";
import { MenuListItem } from "@/components/storefront/menu-list-item";
import { Rail } from "@/components/storefront/rail";
import { MenuHero } from "@/components/storefront/menu-hero";
import { StationNav } from "@/components/storefront/station-nav";
import { Button } from "@/components/ui/button";
import { breadcrumbJsonLd } from "@/web/seo";
import { JsonLd } from "@/components/storefront/json-ld";
import { cn } from "@/shared/utils";
import { getMenuCategories, searchMenu } from "@/server/services/catalog";
import { instanceRestaurantSlug } from "@/web/instance";

const SORTS = [
  ["menu", "Menu order"],
  ["price_asc", "Price, low first"],
  ["price_desc", "Price, high first"],
] as const;

interface MenuPageProps {
  searchParams: Promise<{ category?: string; q?: string; orderType?: string; sort?: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const restaurantSlug = instanceRestaurantSlug();
  try {
    const { restaurant } = await getStorefrontContext(restaurantSlug);
    return {
      ...(await configuredPageMetadata(restaurant.id, "menu", {
        title: "Menu",
        description: `Browse the full ${restaurant.name} menu: ${restaurant.cuisines.join(", ")}.`,
      })),
      alternates: { canonical: `/menu` },
    };
  } catch {
    return { title: "Menu" };
  }
}

/** Menu browsing: categories, search and ordering all run in the database. */
export default async function MenuPage({ searchParams }: MenuPageProps) {
  const restaurantSlug = instanceRestaurantSlug();
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
  // Multi-branch ordering (null with the feature off): the tray's branch decides which dishes are
  // offered, and the tray's order type is the menu's unless a tab was picked explicitly.
  const branching = await getBranching(context);
  const tray = branching ? await readTray(context) : null;
  const explicitOrderType = ORDER_TYPES.includes(orderType as OrderType);
  const activeOrderType: OrderType = explicitOrderType
    ? (orderType as OrderType)
    : (tray?.orderType ?? context.config.ordering.defaultOrderType);
  const offHere = new Set(tray?.locationId ? (branching?.unavailable[tray.locationId] ?? []) : []);
  const search = (q ?? "").trim();
  const base = `/menu`;
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
  const stations = grouped.map((group) => ({ slug: group.category.slug, name: group.category.name, count: group.items.length, icon: group.category.icon }));
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
  const heroImage = heading.image ?? resolveImage(restaurant.coverUrl) ?? (grouped[0] ? chapterPhoto(grouped[0]) : null);
  // alaCarteEnabled off means every non-buffet category/item is already hidden from this menu (rule 12) —
  // the whole page IS the buffet, so it earns a taller hero and its own "how this works" band.
  const isBuffetOnly = !restaurant.features.alaCarteEnabled;
  const reservations = restaurant.settings.reservations;
  // set in super admin on the menu page's "Page content" section
  const layout = heading.menuLayout;
  const isGrid = layout === "grid";
  const chapterProps = (group: (typeof grouped)[number]) => ({
    id: group.category.slug,
    "aria-labelledby": `${group.category.slug}-title`,
  });
  const listItem = (item: (typeof items)[number]) => (
    <MenuListItem
      item={item}
      restaurantSlug={restaurant.slug}
      currencySymbol={restaurant.currencySymbol}
      locale={restaurant.locale}
      showPrepTime={context.config.ordering.showPrepTime}
      orderType={activeOrderType}
      offAtBranch={offHere.has(item.id)}
    />
  );
  const tile = (item: (typeof items)[number], layout: "card" | "row") => (
    <DishTile
      item={item}
      layout={layout}
      restaurantSlug={restaurant.slug}
      currencySymbol={restaurant.currencySymbol}
      locale={restaurant.locale}
      showPrepTime={context.config.ordering.showPrepTime}
      orderType={activeOrderType}
      offAtBranch={offHere.has(item.id)}
      inlineAdd={isGrid && layout === "card"}
    />
  );
  const dishes = (count: number) => `${count} dish${count === 1 ? "" : "es"}`;

  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: restaurant.name, path: "/" },
          { name: "Menu", path: base },
        ])}
      />

      <MenuHero
        image={heroImage}
        title={heading.title}
        subtitle={heading.subtitle}
        dim={heading.photoDarkening}
        mobileHeight={heading.mobileBannerHeight}
        search={{
          action: base,
          hidden: { orderType: activeOrderType, ...(category ? { category } : {}) },
          q: search,
          sort: sort ?? "menu",
          placeholder: heading.searchPlaceholder,
          options: SORTS.map(([value, label]) => ({
            value,
            label,
            href: keep({ sort: value === "menu" ? undefined : value }),
            active: (sort ?? "menu") === value,
          })),
        }}
      />

      <MenuOrderTypeSync orderType={activeOrderType} explicit={explicitOrderType} />

      {isBuffetOnly ? (
        <section className="tone-paper section-y">
          <div className="container-page grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-16">
            <div className={heroImage ? undefined : "lg:col-span-2 lg:max-w-2xl"}>
              <p className="eyebrow mb-3">How it works</p>
              <h2 className="display-1">Unlimited dining, one reservation</h2>
              <p className="lede mt-4">
                {restaurant.description ||
                  restaurant.shortDescription ||
                  `${restaurant.name} serves an all-you-can-eat buffet — reserve a table and the kitchen takes care of the rest.`}
              </p>
              <dl className="mt-6 grid grid-cols-2 gap-5 text-sm">
                <div>
                  <dt className="text-[var(--color-muted-ink)]">Seating length</dt>
                  <dd className="tabular mt-1 text-lg font-semibold">{reservations.defaultDurationMinutes} min</dd>
                </div>
                <div>
                  <dt className="text-[var(--color-muted-ink)]">Party size</dt>
                  <dd className="tabular mt-1 text-lg font-semibold">
                    {reservations.minGuests}–{reservations.maxGuests} guests
                  </dd>
                </div>
              </dl>
              {restaurant.features.reservations ? (
                <Button asChild className="mt-6">
                  <Link href={`/reservation`}>Reserve a table</Link>
                </Button>
              ) : null}
            </div>
            {heroImage ? (
              <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--radius-card)] bg-[var(--steel-2)]">
                <Image src={heroImage} alt="" fill sizes="(min-width: 1024px) 45vw, 100vw" className="object-cover" />
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

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
          {/* the sidebar layout carries its own category index on wide screens; the rail stays for phones */}
          <div
            className={cn(
              "tone-paper sticky top-[var(--header-h,4.25rem)] z-30 border-b border-[var(--rule)] bg-[color-mix(in_srgb,var(--color-canvas)_92%,transparent)] backdrop-blur-lg",
              layout === "sidebar" && "lg:hidden",
            )}
          >
            <div className="container-page">
              <StationNav stations={stations} variant="rail" />
            </div>
          </div>

          {layout === "list" ? (
            // a printed menu: two columns of chapters, each a run of lines; no photographs
            <section className="tone-paper section-y">
              <div className="container-page lg:columns-2 lg:gap-16 xl:gap-24">
                {grouped.map((group) => (
                  <section
                    key={group.category.id}
                    {...chapterProps(group)}
                    className="mb-14 break-inside-avoid scroll-mt-[calc(var(--header-h,4.25rem)+3.5rem)] last:mb-0 md:mb-16"
                  >
                    <h2 id={`${group.category.slug}-title`} className="display-2">
                      {group.category.name}
                    </h2>
                    {group.category.description ? (
                      <p className="mt-2.5 flex items-center gap-3 font-[family-name:var(--font-display)] text-[15px] italic text-[var(--color-muted-ink)]">
                        <span aria-hidden className="h-px w-7 shrink-0 bg-[var(--color-brand-accent)]" />
                        {group.category.description}
                      </p>
                    ) : null}
                    <ul className="mt-5 divide-y divide-[var(--rule)] border-t border-[var(--rule-strong)]">
                      {group.items.map((item) => (
                        <li key={item.id}>{listItem(item)}</li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </section>
          ) : layout === "sidebar" ? (
            // a standing category index beside the dishes; each chapter opens on its own photograph
            <section className="tone-paper section-y">
              <div className="container-page grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[13.5rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)] xl:gap-16">
                <aside className="hidden lg:block">
                  <div className="sticky top-[calc(var(--header-h,4.25rem)+2rem)] border-l border-[var(--rule)]">
                    <StationNav stations={stations} variant="index" />
                  </div>
                </aside>
                <div className="min-w-0 space-y-14 md:space-y-16">
                  {grouped.map((group) => {
                    const photo = chapterPhoto(group);
                    return (
                      <section
                        key={group.category.id}
                        {...chapterProps(group)}
                        className="scroll-mt-[calc(var(--header-h,4.25rem)+3.5rem)] lg:scroll-mt-[calc(var(--header-h,4.25rem)+2rem)]"
                      >
                        {photo ? (
                          <header className="tone-night relative isolate flex h-40 items-end overflow-hidden rounded-[var(--radius-panel)] md:h-48">
                            <Image src={photo} alt="" fill sizes="(min-width: 1024px) 60vw, 100vw" className="reveal-plate -z-20 object-cover" />
                            <span
                              aria-hidden
                              className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgb(0_0_0/0.72)_0%,rgb(0_0_0/0.35)_55%,rgb(0_0_0/0.1)_100%)]"
                            />
                            <div className="p-5 md:p-7">
                              <h2 id={`${group.category.slug}-title`} className="display-2">
                                {group.category.name}
                              </h2>
                              {group.category.description ? (
                                <p className="mt-1.5 font-[family-name:var(--font-display)] text-[15px] italic text-[var(--color-muted-ink)]">
                                  {group.category.description}
                                </p>
                              ) : null}
                            </div>
                          </header>
                        ) : (
                          <header className="border-b border-[var(--rule-strong)] pb-5">
                            <h2 id={`${group.category.slug}-title`} className="display-2">
                              {group.category.name}
                            </h2>
                            {group.category.description ? <p className="lede mt-2">{group.category.description}</p> : null}
                          </header>
                        )}
                        <ul className="divide-y divide-[var(--rule)]">
                          {group.items.map((item) => (
                            <li key={item.id}>{tile(item, "row")}</li>
                          ))}
                        </ul>
                      </section>
                    );
                  })}
                </div>
              </div>
            </section>
          ) : layout === "rows" ? (
            // every category one horizontal shelf of cards (swipe, trackpad or the arrows)
            <section className="tone-paper section-y overflow-hidden">
              <div className="container-page space-y-14 md:space-y-16">
                {grouped.map((group) => (
                  <section
                    key={group.category.id}
                    {...chapterProps(group)}
                    className="scroll-mt-[calc(var(--header-h,4.25rem)+3.5rem)]"
                  >
                    <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2 border-b border-[var(--rule)] pb-4">
                      <div className="min-w-0">
                        <h2 id={`${group.category.slug}-title`} className="display-2">
                          {group.category.name}
                        </h2>
                        {group.category.description ? (
                          <p className="mt-1.5 max-w-xl text-[15px] leading-relaxed text-[var(--color-muted-ink)]">{group.category.description}</p>
                        ) : null}
                      </div>
                      <p className="tabular label-caps font-semibold text-[var(--color-muted-ink)]">
                        {dishes(group.items.length)}
                      </p>
                    </header>
                    <Rail
                      label={`${group.category.name} dishes`}
                      className="mt-6"
                      itemClassName="w-[72%] sm:w-[calc((100%-1.5rem)/2.35)] lg:w-[calc((100%-3rem)/3.3)] xl:w-[calc((100%-4.5rem)/4.25)]"
                    >
                      {group.items.map((item) => (
                        <div key={item.id} className="h-full">
                          {tile(item, "card")}
                        </div>
                      ))}
                    </Rail>
                  </section>
                ))}
              </div>
            </section>
          ) : isGrid ? (
            <section className="tone-paper section-y">
              <div className="container-page">
                {grouped.map((group, index) => (
                  <div
                    key={group.category.id}
                    id={group.category.slug}
                    aria-labelledby={`${group.category.slug}-title`}
                    className={cn("scroll-mt-[calc(var(--header-h,4.25rem)+3rem)]", index > 0 && "mt-10 md:mt-12")}
                  >
                    <div className="flex items-end justify-between gap-4">
                      <h2 id={`${group.category.slug}-title`} className="display-3 flex items-center gap-3 uppercase">
                        <span aria-hidden className="block h-px w-6 shrink-0 bg-[var(--color-brand-accent)]" />
                        {group.category.name}
                      </h2>
                      <p className="text-xs text-[var(--color-muted-ink)]">{group.items.length} item{group.items.length === 1 ? "" : "s"}</p>
                    </div>
                    <ul className="mt-5 grid grid-cols-2 gap-3 md:mt-6 md:grid-cols-3 md:gap-5 xl:grid-cols-4">
                      {group.items.map((item) => (
                        <li key={item.id}>{tile(item, "card")}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            grouped.map((group, index) => {
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
                          <p className="eyebrow mb-3">{dishes(group.items.length)}</p>
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
          })
          )}
        </>
      )}
    </>
  );
}
