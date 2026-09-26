import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import type { StorefrontContext } from "@/shared/contract/models";
import type { MenuCategoriesSection as CategoriesConfig } from "@/shared/contract/sections";
import { resolveImage, resolveMenuImage } from "@/web/media";
import { cn } from "@/shared/utils";
import { SectionIcon } from "@/components/storefront/icon";
import { SectionHeading } from "@/components/storefront/section-heading";
import { SectionShell } from "@/components/storefront/section-shell";
import { getMenuCategories, searchMenu } from "@/server/services/catalog";

/**
 * Visual category discovery. Every category is a tall photograph with its name and dish count. On wide
 * screens they stand in one row and the one under the pointer widens to show its description; on phones
 * and tablets they form a two / three column grid. A category without its own photo borrows the photo
 * of one of its own dishes (real data, never a stock image).
 */
export async function MenuCategoriesSection({
  section,
  context,
}: {
  section: CategoriesConfig;
  context: StorefrontContext;
}) {
  const [allCategories, items] = await Promise.all([
    getMenuCategories(context.restaurant.id, { withCounts: true }),
    section.showImages ? searchMenu(context.restaurant.id, { limit: 200 }) : Promise.resolve([]),
  ]);
  const categories = allCategories.filter((category) => (category.itemCount ?? 0) > 0).slice(0, section.limit);
  if (!categories.length) return null;

  const photoFor = (categoryId: string, categorySlug: string, own: string | null) => {
    if (!section.showImages) return null;
    const direct = resolveImage(own);
    if (direct) return direct;
    for (const item of items) {
      if (item.categoryId !== categoryId) continue;
      const photo = resolveMenuImage(item.imageUrl, categorySlug);
      if (photo) return photo;
    }
    return null;
  };

  const menuHref = `/r/${context.restaurant.slug}/menu`;
  // the last tile closes its row on phones (2 columns) and tablets (3 columns); one row from lg up
  const phoneSpan = categories.length % 2 === 1 ? "col-span-2" : "col-span-1";
  const tabletSpan = ["sm:col-span-1", "sm:col-span-3", "sm:col-span-2"][categories.length % 3];
  const lastSpan = `${phoneSpan} ${tabletSpan}`;

  return (
    <SectionShell tone="muted">
      <SectionHeading
        eyebrow="The menu"
        title={section.title}
        subtitle={section.subtitle}
        action={
          <Link href={menuHref} className="link-arrow">
            View all categories
            <ArrowRight aria-hidden />
          </Link>
        }
      />

      <ul className="section-body grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:flex lg:h-[27rem] lg:gap-3">
        {categories.map((category, index) => {
          const photo = photoFor(category.id, category.slug, category.imageUrl);
          const count = category.itemCount ?? 0;
          const last = index === categories.length - 1;
          return (
            <li
              key={category.id}
              className={cn(
                "group/cat relative lg:min-w-0 lg:flex-1 lg:transition-[flex-grow] lg:duration-700 lg:ease-[cubic-bezier(0.23,1,0.32,1)] lg:hover:flex-[1.9]",
                last && lastSpan,
              )}
            >
              <Link
                href={`${menuHref}#${category.slug}`}
                className="group relative isolate flex h-full min-h-[13rem] flex-col justify-end overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-night)] p-4 text-white sm:min-h-[15rem] md:p-5"
              >
                {photo ? (
                  <Image
                    src={photo}
                    alt=""
                    fill
                    sizes="(min-width: 1024px) 24vw, (min-width: 640px) 33vw, 50vw"
                    className="zoom-on-hover -z-20 object-cover"
                  />
                ) : (
                  <span aria-hidden className="absolute right-4 top-4 -z-10 text-[var(--color-brand-accent)] opacity-70">
                    <SectionIcon name={category.icon} className="size-7" />
                  </span>
                )}
                <span aria-hidden className="scrim-bottom absolute inset-0 -z-10" />
                <span className="font-[family-name:var(--font-display)] text-[1.2rem] leading-tight md:text-[1.4rem]">
                  {category.name}
                </span>
                {category.description ? (
                  <span className="hidden max-h-0 overflow-hidden text-[13px] leading-relaxed text-white/75 opacity-0 transition-[max-height,opacity,margin] duration-500 lg:block lg:group-hover/cat:mt-2 lg:group-hover/cat:max-h-24 lg:group-hover/cat:opacity-100">
                    {category.description}
                  </span>
                ) : null}
                <span className="mt-2 flex items-center gap-2 text-[12px] font-medium text-white/75">
                  <span className="tabular">
                    {count} dish{count === 1 ? "" : "es"}
                  </span>
                  <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-1" aria-hidden />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </SectionShell>
  );
}
