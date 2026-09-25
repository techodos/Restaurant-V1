import Link from "next/link";
import Image from "next/image";
import { Clock } from "lucide-react";
import { formatMoney } from "@/shared/money";
import { resolveMenuImage } from "@/web/media";
import type { MenuItemSummary } from "@/shared/contract/models";
import { QuickAddButton } from "./quick-add-button";
import { SpiceLevel } from "./spice-level";

interface MenuItemCardProps {
  item: MenuItemSummary;
  restaurantSlug: string;
  currencySymbol: string;
  locale: string;
  showPrepTime?: boolean;
  orderType?: string | undefined;
}

/** Menu card used by every menu surface (home sections, menu list, search). */
export function MenuItemCard({
  item,
  restaurantSlug,
  currencySymbol,
  locale,
  showPrepTime = true,
  orderType,
}: MenuItemCardProps) {
  const image = resolveMenuImage(item.imageUrl, item.categorySlug);
  const detailHref = `/r/${restaurantSlug}/menu/${item.slug}`;
  const price = formatMoney(item.priceFrom, { currency: currencySymbol, locale, compact: false });

  return (
    <article className="surface-card hover-lift group relative flex h-full flex-col overflow-hidden">
      <Link
        href={detailHref}
        className="relative block aspect-[4/3] overflow-hidden bg-[color-mix(in_srgb,var(--color-ink)_6%,transparent)]"
        tabIndex={-1}
        aria-hidden
      >
        {image ? (
          <Image
            src={image}
            alt=""
            fill
            sizes="(min-width: 1024px) 380px, (min-width: 640px) 45vw, 90vw"
            className="object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.05]"
          />
        ) : (
          <span className="grid h-full place-items-center font-[family-name:var(--font-display)] text-4xl text-[var(--color-muted-ink)]">
            {item.name.slice(0, 1)}
          </span>
        )}
        {!item.isAvailable ? (
          <span className="absolute inset-0 grid place-items-center bg-[color-mix(in_srgb,var(--color-ink)_60%,transparent)] text-sm font-semibold text-white backdrop-grayscale">
            Sold out today
          </span>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex-1">
          <div className="flex items-start justify-between gap-4">
            <h3 className="font-[family-name:var(--font-sans)] text-[1.05rem] font-semibold leading-snug tracking-[-0.01em]">
              <Link href={detailHref} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none">
                {item.name}
              </Link>
            </h3>
            <p className="tabular shrink-0 text-right">
              <span className="block whitespace-nowrap font-semibold text-[var(--color-ink)]">{price}</span>
              {item.compareAtPrice ? (
                <span className="block whitespace-nowrap text-xs text-[var(--color-muted-ink)] line-through">
                  {formatMoney(item.compareAtPrice, { currency: currencySymbol, locale })}
                </span>
              ) : null}
            </p>
          </div>
          {item.description ? (
            <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-[var(--color-muted-ink)]">{item.description}</p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-[var(--color-muted-ink)]">
            {item.dietaryTags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-[color-mix(in_srgb,var(--color-brand)_9%,transparent)] px-2 py-0.5 font-medium text-[var(--color-brand)]"
              >
                {tag}
              </span>
            ))}
            <SpiceLevel level={item.spiceLevel} />
            {showPrepTime ? (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3.5" aria-hidden />
                {item.prepTimeMinutes} min
              </span>
            ) : null}
          </div>
        </div>

        {/* above the full-card link so it stays clickable */}
        <div className="relative z-10">
          <QuickAddButton
            restaurantSlug={restaurantSlug}
            item={{
              id: item.id,
              name: item.name,
              slug: item.slug,
              requiresSelection: item.requiresSelection,
              isAvailable: item.isAvailable,
            }}
            orderType={orderType}
          />
        </div>
      </div>
    </article>
  );
}
