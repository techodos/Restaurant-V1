import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ORDER_TYPES, type OrderType } from "@/shared/contract/enums";
import { getStorefrontContext, requireStorefront } from "@/web/storefront";
import { breadcrumbJsonLd, menuItemJsonLd } from "@/web/seo";
import { JsonLd } from "@/components/storefront/json-ld";
import { DishDetail } from "@/components/storefront/dish-detail";
import { DishTile } from "@/components/storefront/dish-tile";
import { findMenuItemBySlug, searchMenu } from "@/server/services/catalog";
import { instanceRestaurantSlug } from "@/web/instance";

interface ItemPageProps {
  params: Promise<{ itemSlug: string }>;
  searchParams: Promise<{ orderType?: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: ItemPageProps): Promise<Metadata> {
  const restaurantSlug = instanceRestaurantSlug();
  const { itemSlug } = await params;
  try {
    const { restaurant } = await getStorefrontContext(restaurantSlug);
    const item = await findMenuItemBySlug(restaurant.id, itemSlug);
    if (!item) return { title: "Item not found" };
    return {
      title: item.name,
      description: item.description ?? `${item.name} at ${restaurant.name}.`,
      alternates: { canonical: `/menu/${item.slug}` },
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

/**
 * Full-page dish (direct links, shares, reloads, search engines). Navigating from the menu opens the
 * same DishDetail in a sheet instead (@modal/(.)menu/[itemSlug]).
 */
export default async function MenuItemPage({ params, searchParams }: ItemPageProps) {
  const restaurantSlug = instanceRestaurantSlug();
  const { itemSlug } = await params;
  const { orderType } = await searchParams;

  const context = await requireStorefront(restaurantSlug);

  const { restaurant } = context;
  const item = await findMenuItemBySlug(restaurant.id, itemSlug);
  if (!item || !item.isActive) notFound();

  const activeOrderType: OrderType = ORDER_TYPES.includes(orderType as OrderType)
    ? (orderType as OrderType)
    : context.config.ordering.defaultOrderType;

  const related = (await searchMenu(restaurant.id, { excludeIds: [item.id], limit: 4 })).slice(0, 4);

  return (
    <div className="container-page page-y">
      <JsonLd data={menuItemJsonLd(item, restaurant)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: restaurant.name, path: "/" },
          { name: "Menu", path: `/menu` },
          { name: item.name, path: `/menu/${item.slug}` },
        ])}
      />

      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-[var(--color-muted-ink)]">
        <Link
          href={`/menu`}
          className="group inline-flex items-center gap-1.5 font-medium transition-colors hover:text-[var(--color-ink)]"
        >
          <ArrowLeft className="size-4 transition-transform duration-200 group-hover:-translate-x-0.5" aria-hidden />
          Menu
        </Link>
      </nav>

      <DishDetail context={context} item={item} orderType={activeOrderType} variant="page" />

      {related.length ? (
        <section className="mt-14 border-t border-[var(--rule)] pt-8">
          <h2 className="text-[1.6rem] font-semibold md:text-[2rem]">Also from the kitchen</h2>
          <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-4 md:gap-x-6">
            {related.map((entry) => (
              <li key={entry.id}>
                <DishTile
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
