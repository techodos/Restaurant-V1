import type { StorefrontContext } from "@/lib/contract/models";
import type { FeaturedItemsSection as FeaturedConfig } from "@/lib/contract/sections";
import { listMenuItems } from "@/lib/db/menu";
import { EMPTY_CONTEXT } from "@/lib/db/pool";
import { MenuItemCard } from "../menu-item-card";
import { CtaLink } from "../cta-link";
import { SectionHeading } from "../section-heading";
import { SectionShell } from "../section-shell";

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
    ? await listMenuItems(context.restaurant.id, { slugs: section.itemSlugs, limit: section.itemSlugs.length }, EMPTY_CONTEXT)
    : await listMenuItems(context.restaurant.id, { featuredOnly: true, limit: section.limit }, EMPTY_CONTEXT);

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
