import type { StorefrontContext } from "@/shared/contract/models";
import type { FeaturedItemsSection as FeaturedConfig } from "@/shared/contract/sections";
import { DishTile } from "@/components/storefront/dish-tile";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Rail } from "@/components/storefront/rail";
import { SectionHeading } from "@/components/storefront/section-heading";
import { SectionShell } from "@/components/storefront/section-shell";
import { searchMenu } from "@/server/services/catalog";

/**
 * Signature dishes on the paper ground: explicit slugs from the section config when provided, otherwise
 * whatever the restaurant marked as featured. One scroll-snapping rail at every size (a peek of the next
 * dish on phones, four across on wide screens) with previous / next controls.
 */
export async function FeaturedItemsSection({
  section,
  context,
}: {
  section: FeaturedConfig;
  context: StorefrontContext;
}) {
  const items = section.itemSlugs.length
    ? await searchMenu(context.restaurant.id, { slugs: section.itemSlugs, limit: section.itemSlugs.length })
    : await searchMenu(context.restaurant.id, { featuredOnly: true, limit: section.limit });

  // keep the order the editor chose
  const ordered = section.itemSlugs.length
    ? section.itemSlugs
        .map((slug) => items.find((item) => item.slug === slug))
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
    : items.slice(0, section.limit);

  if (!ordered.length) return null;

  const tile = (item: (typeof ordered)[number]) => (
    <DishTile
      key={item.id}
      item={item}
      size="lg"
      restaurantSlug={context.restaurant.slug}
      currencySymbol={context.restaurant.currencySymbol}
      locale={context.restaurant.locale}
    />
  );

  return (
    <SectionShell tone="paper">
      <SectionHeading
        eyebrow="Signature dishes"
        title={section.title}
        subtitle={section.subtitle}
        action={
          section.cta ? (
            <Link href={section.cta.href} className="link-arrow">
              {section.cta.label}
              <ArrowRight aria-hidden />
            </Link>
          ) : null
        }
      />

      <Rail
        label="featured dishes"
        className="section-body"
        itemClassName="w-[78%] sm:w-[calc((100%-1.5rem)/2)] lg:w-[calc((100%-3rem)/3)] xl:w-[calc((100%-4.5rem)/4)]"
      >
        {ordered.map((item) => tile(item))}
      </Rail>
    </SectionShell>
  );
}
