import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import type { StorefrontContext } from "@/shared/contract/models";
import type { MenuCategoriesSection as CategoriesConfig } from "@/shared/contract/sections";
import { resolveImage } from "@/web/media";
import { cn } from "@/shared/utils";
import { SectionIcon } from "@/components/storefront/icon";
import { SectionHeading } from "@/components/storefront/section-heading";
import { SectionShell } from "@/components/storefront/section-shell";
import { getMenuCategories } from "@/server/services/catalog";

/** extra lg columns the last tile must absorb, by empty-cell count in its row */
const LG_SPAN: Record<number, string> = { 0: "lg:col-span-1", 1: "lg:col-span-2", 2: "lg:col-span-3", 3: "lg:col-span-4" };

/**
 * Categories as photo tiles. With four or more, the first tile is a double-size feature so the grid has
 * rhythm instead of identical boxes; a tile falls back to its icon when the category has no image.
 */
export async function MenuCategoriesSection({
  section,
  context,
}: {
  section: CategoriesConfig;
  context: StorefrontContext;
}) {
  const categories = (await getMenuCategories(context.restaurant.id, { withCounts: true })).slice(
    0,
    section.limit,
  );
  if (!categories.length) return null;
  const feature = categories.length >= 4;
  // The last tile stretches to close any gap in its row: the feature tile takes 4 cells, phones have
  // 2 columns and large screens 4, so the remainder differs per breakpoint.
  const cells = feature ? categories.length + 3 : categories.length;
  const phoneSpan = cells % 2 === 1 ? "col-span-2" : "";
  const desktopSpan = LG_SPAN[(4 - (cells % 4)) % 4] ?? "";

  return (
    <SectionShell tone="surface">
      <SectionHeading title={section.title} subtitle={section.subtitle} />
      <ul className="mt-10 grid auto-rows-[10.5rem] grid-cols-2 gap-3 sm:gap-4 md:auto-rows-[13rem] lg:grid-cols-4">
        {categories.map((category, index) => {
          const image = section.showImages ? resolveImage(category.imageUrl) : null;
          const count = category.itemCount ?? 0;
          const isFeature = feature && index === 0;
          return (
            <li
              key={category.id}
              className={cn(
                isFeature && "col-span-2 row-span-2",
                index === categories.length - 1 && [phoneSpan, desktopSpan],
              )}
            >
              <Link
                href={`/r/${context.restaurant.slug}/menu#${category.slug}`}
                className={cn(
                  "group relative isolate flex h-full flex-col justify-end overflow-hidden rounded-[var(--radius-card)] p-4 transition-colors md:p-5",
                  image
                    ? "bg-[var(--color-brand-secondary)] text-white"
                    : "border border-[var(--color-hairline)] bg-[color-mix(in_srgb,var(--color-brand)_7%,var(--color-surface))] text-[var(--color-ink)] hover:border-[var(--color-brand)]",
                )}
              >
                {image ? (
                  <>
                    <Image
                      src={image}
                      alt=""
                      fill
                      sizes={isFeature ? "(min-width: 1024px) 50vw, 100vw" : "(min-width: 1024px) 25vw, 50vw"}
                      className="-z-20 object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.06]"
                    />
                    <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
                  </>
                ) : (
                  <span aria-hidden className="absolute left-4 top-4 -z-10 text-[var(--color-brand)] md:left-5 md:top-5">
                    <SectionIcon name={category.icon} className={isFeature ? "size-10" : "size-7"} />
                  </span>
                )}
                <span className="absolute right-3 top-3 grid size-9 place-items-center rounded-full bg-[color-mix(in_srgb,currentColor_14%,transparent)] opacity-0 backdrop-blur-md transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100">
                  <ArrowUpRight className="size-4" aria-hidden />
                </span>
                <span
                  className={cn(
                    "block font-[family-name:var(--font-display)] font-semibold leading-tight tracking-[-0.02em]",
                    isFeature ? "text-2xl md:text-4xl" : "text-lg md:text-xl",
                  )}
                >
                  {category.name}
                </span>
                {isFeature && category.description ? (
                  <span className="mt-2 hidden max-w-sm text-sm opacity-80 md:block">{category.description}</span>
                ) : null}
                <span className="mt-1 block text-xs font-medium opacity-70">
                  {count} dish{count === 1 ? "" : "es"}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </SectionShell>
  );
}
