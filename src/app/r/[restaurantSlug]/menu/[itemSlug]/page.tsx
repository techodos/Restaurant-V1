import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, Flame, Info } from "lucide-react";
import { ORDER_TYPES, type OrderType } from "@/shared/contract/enums";
import { getStorefrontContext, requireStorefront } from "@/web/storefront";
import { resolveMenuImage } from "@/web/media";
import { formatMoney } from "@/shared/money";
import { breadcrumbJsonLd, menuItemJsonLd } from "@/web/seo";
import { JsonLd } from "@/components/storefront/json-ld";
import { ItemCustomizer } from "@/components/storefront/item-customizer";
import { MenuItemCard } from "@/components/storefront/menu-item-card";
import { Badge } from "@/components/ui/badge";
import { findMenuItemBySlug, searchMenu } from "@/server/services/catalog";

interface ItemPageProps {
  params: Promise<{ restaurantSlug: string; itemSlug: string }>;
  searchParams: Promise<{ orderType?: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: ItemPageProps): Promise<Metadata> {
  const { restaurantSlug, itemSlug } = await params;
  try {
    const { restaurant } = await getStorefrontContext(restaurantSlug);
    const item = await findMenuItemBySlug(restaurant.id, itemSlug);
    if (!item) return { title: "Item not found" };
    return {
      title: item.name,
      description: item.description ?? `${item.name} at ${restaurant.name}.`,
      alternates: { canonical: `/r/${restaurant.slug}/menu/${item.slug}` },
      openGraph: {
        title: item.name,
        description: item.description ?? undefined,
        images: item.imageUrl ? [item.imageUrl] : undefined,
      },
    };
  } catch {
    return { title: "Menu item" };
  }
}

export default async function MenuItemPage({ params, searchParams }: ItemPageProps) {
  const { restaurantSlug, itemSlug } = await params;
  const { orderType } = await searchParams;

  const context = await requireStorefront(restaurantSlug);

  const { restaurant } = context;
  const item = await findMenuItemBySlug(restaurant.id, itemSlug);
  if (!item || !item.isActive) notFound();

  const activeOrderType: OrderType = ORDER_TYPES.includes(orderType as OrderType)
    ? (orderType as OrderType)
    : context.config.ordering.defaultOrderType;

  const related = (
    await searchMenu(restaurant.id, { excludeIds: [item.id], limit: 4 })
  ).slice(0, 3);

  const image = resolveMenuImage(item.imageUrl, null);
  const fromPrice = item.variants.length
    ? item.variants
        .map((variant) =>
          variant.priceMode === "delta"
            ? { price: item.basePrice, delta: variant.price }
            : { price: variant.price, delta: "0.00" },
        )
        .reduce((lowest, candidate) => (Number(candidate.price) < Number(lowest.price) ? candidate : lowest))
    : null;

  return (
    <div className="container-page py-8 md:py-12">
      <JsonLd data={menuItemJsonLd(item, restaurant)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: restaurant.name, path: `/r/${restaurant.slug}` },
          { name: "Menu", path: `/r/${restaurant.slug}/menu` },
          { name: item.name, path: `/r/${restaurant.slug}/menu/${item.slug}` },
        ])}
      />

      <nav aria-label="Breadcrumb" className="text-sm text-[var(--color-muted-ink)]">
        <Link
          href={`/r/${restaurant.slug}/menu`}
          className="group inline-flex items-center gap-1.5 font-medium transition-colors hover:text-[var(--color-ink)]"
        >
          <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" aria-hidden />
          Back to menu
        </Link>
      </nav>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-16">
        <div className="lg:sticky lg:top-[calc(var(--header-h,4.5rem)+1.5rem)] lg:self-start">
          <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--radius-panel)] bg-[color-mix(in_srgb,var(--color-ink)_6%,transparent)] shadow-[var(--shadow-raised)]">
            {image ? (
              <Image
                src={image}
                alt={item.name}
                fill
                priority
                sizes="(min-width: 1024px) 560px, 92vw"
                className="object-cover"
              />
            ) : (
              <span className="grid h-full place-items-center text-4xl font-semibold text-[var(--color-muted-ink)]" aria-hidden>
                {item.name.slice(0, 1)}
              </span>
            )}
          </div>

          <dl className="surface-flat mt-5 grid grid-cols-2 gap-4 p-5 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-[var(--color-muted-ink)]">Prep time</dt>
              <dd className="mt-1 flex items-center gap-1.5 font-medium">
                <Clock className="size-4" aria-hidden />
                {item.prepTimeMinutes} min
              </dd>
            </div>
            {item.calories ? (
              <div>
                <dt className="text-[var(--color-muted-ink)]">Calories</dt>
                <dd className="mt-1 font-medium">{item.calories} kcal</dd>
              </div>
            ) : null}
            {item.spiceLevel > 0 ? (
              <div>
                <dt className="text-[var(--color-muted-ink)]">Spice</dt>
                <dd className="mt-1 flex items-center gap-1 font-medium">
                  <Flame className="size-4 text-[var(--color-brand)]" aria-hidden />
                  {item.spiceLevel}/3
                </dd>
              </div>
            ) : null}
            {item.allergens.length ? (
              <div className="col-span-2">
                <dt className="text-[var(--color-muted-ink)]">Contains</dt>
                <dd className="mt-1 font-medium">{item.allergens.join(", ")}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            {item.isFeatured ? <Badge variant="soft">Guest favourite</Badge> : null}
            {item.dietaryTags.map((tag) => (
              <Badge key={tag} variant="neutral">
                {tag}
              </Badge>
            ))}
            {!item.isAvailable ? <Badge variant="danger">Sold out today</Badge> : null}
          </div>

          <h1 className="mt-4 text-[2.25rem] font-semibold leading-[1.05] md:text-[3rem]">{item.name}</h1>
          {item.description ? (
            <p className="mt-4 max-w-[58ch] text-pretty text-base leading-relaxed text-[var(--color-muted-ink)] md:text-[17px]">{item.description}</p>
          ) : null}

          <p className="tabular mt-5 text-2xl font-semibold text-[var(--color-ink)]">
            {formatMoney(item.basePrice, { currency: restaurant.currencySymbol, locale: restaurant.locale })}
            {fromPrice ? (
              <span className="ml-2 text-sm font-normal text-[var(--color-muted-ink)]">
                base price · {item.variants.length} size{item.variants.length === 1 ? "" : "s"}
              </span>
            ) : null}
          </p>

          <div className="mt-8 border-t border-[var(--color-hairline)] pt-8">
            <ItemCustomizer
              restaurantSlug={restaurant.slug}
              item={item}
              currencySymbol={restaurant.currencySymbol}
              locale={restaurant.locale}
              orderType={activeOrderType}
            />
          </div>

          {!item.isAvailable ? (
            <p className="mt-4 flex items-start gap-2 text-sm text-[var(--color-muted-ink)]">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              This item is unavailable today. You can still browse the rest of the menu.
            </p>
          ) : null}
        </div>
      </div>

      {related.length ? (
        <section className="mt-20 border-t border-[var(--color-hairline)] pt-12">
          <h2 className="text-[1.75rem] font-semibold md:text-[2rem]">You may also like</h2>
          <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {related.map((entry) => (
              <li key={entry.id} className="h-full">
                <MenuItemCard
                  item={entry}
                  restaurantSlug={restaurant.slug}
                  currencySymbol={restaurant.currencySymbol}
                  locale={restaurant.locale}
                  orderType={activeOrderType}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
