import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Clock, Flame, Info } from "lucide-react";
import { getMenuItem, listMenuItems } from "@/lib/db/menu";
import { EMPTY_CONTEXT } from "@/lib/db/pool";
import { ORDER_TYPES, type OrderType } from "@/lib/contract/enums";
import { getStorefrontContext } from "@/lib/services/storefront";
import { resolveMenuImage } from "@/lib/media";
import { formatMoney } from "@/lib/money";
import { breadcrumbJsonLd, menuItemJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/storefront/json-ld";
import { ItemCustomizer } from "@/components/storefront/item-customizer";
import { MenuItemCard } from "@/components/storefront/menu-item-card";
import { Badge } from "@/components/ui/badge";

interface ItemPageProps {
  params: Promise<{ restaurantSlug: string; itemSlug: string }>;
  searchParams: Promise<{ orderType?: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: ItemPageProps): Promise<Metadata> {
  const { restaurantSlug, itemSlug } = await params;
  try {
    const { restaurant } = await getStorefrontContext(restaurantSlug);
    const item = await getMenuItem(restaurant.id, { slug: itemSlug }, EMPTY_CONTEXT, { includeUnavailable: true });
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

  let context;
  try {
    context = await getStorefrontContext(restaurantSlug);
  } catch {
    notFound();
  }

  const { restaurant } = context;
  const item = await getMenuItem(restaurant.id, { slug: itemSlug }, EMPTY_CONTEXT, { includeUnavailable: true });
  if (!item || !item.isActive) notFound();

  const activeOrderType: OrderType = ORDER_TYPES.includes(orderType as OrderType)
    ? (orderType as OrderType)
    : context.config.ordering.defaultOrderType;

  const related = (
    await listMenuItems(restaurant.id, { excludeIds: [item.id], limit: 4 }, EMPTY_CONTEXT)
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
        <Link href={`/r/${restaurant.slug}/menu`} className="hover:text-[var(--color-brand)]">
          ← Back to menu
        </Link>
      </nav>

      <div className="mt-6 grid gap-10 lg:grid-cols-2 lg:gap-14">
        <div>
          <div className="relative aspect-4/3 overflow-hidden rounded-[var(--radius-brand)] bg-[color-mix(in_srgb,var(--color-ink)_6%,transparent)]">
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

          <dl className="mt-5 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
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

          <h1 className="mt-3 text-3xl font-semibold md:text-4xl">{item.name}</h1>
          {item.description ? (
            <p className="mt-3 text-pretty leading-relaxed text-[var(--color-muted-ink)]">{item.description}</p>
          ) : null}

          <p className="mt-4 text-xl font-semibold text-[var(--color-brand)]">
            {formatMoney(item.basePrice, { currency: restaurant.currencySymbol, locale: restaurant.locale })}
            {fromPrice ? (
              <span className="ml-2 text-sm font-normal text-[var(--color-muted-ink)]">
                base price · {item.variants.length} size{item.variants.length === 1 ? "" : "s"}
              </span>
            ) : null}
          </p>

          <div className="mt-7">
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
        <section className="mt-16 border-t border-[var(--color-hairline)] pt-10">
          <h2 className="text-2xl font-semibold">You may also like</h2>
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
