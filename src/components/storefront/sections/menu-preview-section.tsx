import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { StorefrontContext } from "@/shared/contract/models";
import type { MenuPreviewSection as PreviewConfig } from "@/shared/contract/sections";
import { DishTile } from "@/components/storefront/dish-tile";
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
    <SectionShell tone="paper">
      <SectionHeading
        title={section.title}
        subtitle={section.subtitle}
        action={
          <Link href={`/r/${context.restaurant.slug}/menu`} className="link-arrow">
            Full menu
            <ArrowRight aria-hidden />
          </Link>
        }
      />
      <ul className="section-body grid grid-cols-2 gap-3 md:gap-6 lg:grid-cols-4">
        {ordered.map((item) => (
          <li key={item.id}>
            <DishTile
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
