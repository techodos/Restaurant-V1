import type { StorefrontContext } from "@/shared/contract/models";
import type { FeaturedItemsSection as FeaturedConfig } from "@/shared/contract/sections";
import { MenuItemCard } from "@/components/storefront/menu-item-card";
import { CtaLink } from "@/components/storefront/cta-link";
import { SectionHeading } from "@/components/storefront/section-heading";
import { SectionShell } from "@/components/storefront/section-shell";
import { searchMenu } from "@/server/services/catalog";

/**
 * Featured items come from the database: explicit slugs from the section config
 * when provided, otherwise whatever the restaurant marked as featured.
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

  // keep the order the editor chose, and never show sold-out items first
  const ordered = section.itemSlugs.length
    ? section.itemSlugs
        .map((slug) => items.find((item) => item.slug === slug))
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
    : items.slice(0, section.limit);

  if (!ordered.length) return null;

  return (
    <SectionShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeading title={section.title} subtitle={section.subtitle} />
        {section.cta ? (
          <div className="hidden md:block">
            <CtaLink cta={section.cta} />
          </div>
        ) : null}
      </div>

      <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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

      {section.cta ? (
        <div className="mt-8 md:hidden">
          <CtaLink cta={section.cta} />
        </div>
      ) : null}
    </SectionShell>
  );
}
