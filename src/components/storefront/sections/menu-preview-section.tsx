import Link from "next/link";
import type { StorefrontContext } from "@/shared/contract/models";
import type { MenuPreviewSection as PreviewConfig } from "@/shared/contract/sections";
import { MenuItemCard } from "@/components/storefront/menu-item-card";
import { SectionHeading } from "@/components/storefront/section-heading";
import { SectionShell } from "@/components/storefront/section-shell";
import { searchMenu } from "@/server/services/catalog";

export async function MenuPreviewSection({
  section,
  context,
}: {
  section: PreviewConfig;
  context: StorefrontContext;
}) {
  const items = await searchMenu(context.restaurant.id, {
      ...(section.itemSlugs.length ? { slugs: section.itemSlugs } : {}),
      ...(section.categorySlug ? { categorySlug: section.categorySlug } : {}),
      limit: section.limit,
      orderBy: section.itemSlugs.length ? "menu" : "popularity",
    });

  if (!items.length) return null;
  const ordered = section.itemSlugs.length
    ? section.itemSlugs
        .map((slug) => items.find((item) => item.slug === slug))
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
    : items;

  return (
    <SectionShell tone="surface">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeading title={section.title} subtitle={section.subtitle} />
        <Link
          href={`/r/${context.restaurant.slug}/menu`}
          className="text-sm font-medium text-[var(--color-brand)] underline-offset-4 hover:underline"
        >
          Full menu →
        </Link>
      </div>
      <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {ordered.map((item) => (
          <li key={item.id} className="h-full">
            <MenuItemCard
              item={item}
              restaurantSlug={context.restaurant.slug}
              currencySymbol={context.restaurant.currencySymbol}
              locale={context.restaurant.locale}
            />
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}
