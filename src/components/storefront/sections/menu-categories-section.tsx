import Link from "next/link";
import Image from "next/image";
import type { StorefrontContext } from "@/lib/contract/models";
import type { MenuCategoriesSection as CategoriesConfig } from "@/lib/contract/sections";
import { listCategories } from "@/lib/db/menu";
import { EMPTY_CONTEXT } from "@/lib/db/pool";
import { resolveImage } from "@/lib/media";
import { SectionIcon } from "../icon";
import { SectionHeading } from "../section-heading";
import { SectionShell } from "../section-shell";

export async function MenuCategoriesSection({
  section,
  context,
}: {
  section: CategoriesConfig;
  context: StorefrontContext;
}) {
  const categories = (await listCategories(context.restaurant.id, EMPTY_CONTEXT, { withCounts: true })).slice(
    0,
    section.limit,
  );
  if (!categories.length) return null;

  return (
    <SectionShell tone="surface">
      <SectionHeading title={section.title} subtitle={section.subtitle} />
      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category) => {
          const image = section.showImages ? resolveImage(category.imageUrl) : null;
          return (
            <li key={category.id}>
              <Link
                href={`/r/${context.restaurant.slug}/menu#${category.slug}`}
                className="group flex h-full items-center gap-4 rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-4 transition-colors hover:border-[var(--color-brand)]"
              >
                {image ? (
                  <span className="relative size-20 shrink-0 overflow-hidden rounded-[var(--radius-brand)]">
                    <Image src={image} alt="" fill sizes="80px" className="object-cover" />
                  </span>
                ) : (
                  <span className="grid size-20 shrink-0 place-items-center rounded-[var(--radius-brand)] bg-[color-mix(in_srgb,var(--color-brand)_10%,transparent)] text-[var(--color-brand)]">
                    <SectionIcon name={category.icon} className="size-7" />
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block font-semibold group-hover:text-[var(--color-brand)]">{category.name}</span>
                  <span className="mt-1 line-clamp-2 block text-sm text-[var(--color-muted-ink)]">
                    {category.description}
                  </span>
                  <span className="mt-1 block text-xs text-[var(--color-muted-ink)]">
                    {category.itemCount ?? 0} item{(category.itemCount ?? 0) === 1 ? "" : "s"}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </SectionShell>
  );
}
