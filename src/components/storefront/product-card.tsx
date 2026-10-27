import Link from "next/link";
import Image from "next/image";
import { formatMoney } from "@/shared/money";
import { resolveMenuImage } from "@/web/media";
import type { MenuItemSummary } from "@/shared/contract/models";
import { cn } from "@/shared/utils";
import { GridAddBar } from "./grid-add-bar";
import { SpiceLevel } from "./spice-level";

/**
 * One dish as a "product card" (the `cards` menu layout, written for phones, fine on any width): a raised card with
 * the photo on the left; on the right the name, two lines of description, a price tag and a worded "Add to Cart"
 * button. The button is the grid layout's own `GridAddBar` (wide form), so adding, the stepper once in the cart,
 * "Customize" for dishes with options, the branch / location gate and sold-out rules are exactly the same.
 * Colours are theme tokens only (the price tag is the accent tint).
 */
export function ProductCard({
  item,
  restaurantSlug,
  currencySymbol,
  locale,
  orderType,
  showPrepTime = false,
  offAtBranch = false,
}: {
  item: MenuItemSummary;
  restaurantSlug: string;
  currencySymbol: string;
  locale: string;
  orderType?: string | undefined;
  showPrepTime?: boolean;
  offAtBranch?: boolean;
}) {
  if (offAtBranch) item = { ...item, isAvailable: false };
  const image = resolveMenuImage(item.imageUrl, item.categorySlug);
  const href = `/menu/${item.slug}${orderType ? `?orderType=${orderType}` : ""}`;
  const price = formatMoney(item.priceFrom, { currency: currencySymbol, locale, compact: true });
  const was = item.compareAtPrice ? formatMoney(item.compareAtPrice, { currency: currencySymbol, locale }) : null;
  const hasMeta = item.spiceLevel > 0 || item.dietaryTags.length > 0 || showPrepTime;

  return (
    <article
      data-dish={item.slug}
      className="flex h-full gap-3.5 rounded-[var(--radius-card)] bg-[var(--color-surface)] p-3 shadow-[0_1px_2px_color-mix(in_srgb,var(--color-ink)_6%,transparent),0_10px_24px_-16px_color-mix(in_srgb,var(--color-ink)_26%,transparent)] ring-1 ring-[color-mix(in_srgb,var(--color-ink)_6%,transparent)] sm:gap-4 sm:p-3.5"
    >
      <Link
        href={href}
        scroll={false}
        tabIndex={-1}
        aria-hidden
        className="relative block size-[6.25rem] shrink-0 self-start overflow-hidden rounded-[calc(var(--radius-card)-4px)] bg-[var(--steel-2)] min-[400px]:size-28 sm:size-32"
      >
        {image ? (
          <Image
            src={image}
            alt=""
            fill
            sizes="(min-width: 640px) 128px, 112px"
            className={cn("object-cover", !item.isAvailable && "grayscale")}
          />
        ) : (
          <span aria-hidden className="grid size-full place-items-center font-[family-name:var(--font-display)] text-4xl text-[var(--color-muted-ink)]">
            {item.name.slice(0, 1)}
          </span>
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="text-[15px] font-semibold leading-snug sm:text-base" style={{ fontFamily: "var(--font-sans)" }}>
          <Link href={href} scroll={false} className="transition-colors duration-200 hover:text-[var(--color-brand)]">
            {item.name}
          </Link>
        </h3>
        {item.description ? (
          <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-[var(--color-muted-ink)] sm:text-[13px]">{item.description}</p>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <p className="tabular inline-flex items-baseline gap-1.5 rounded-md bg-[color-mix(in_srgb,var(--color-brand-accent)_24%,var(--color-surface))] px-2 py-0.5 text-[13px] font-semibold text-[var(--color-ink)]">
            {item.requiresSelection ? <span className="text-[11px] font-semibold uppercase tracking-wide opacity-75">From</span> : null}
            {price}
            {was ? <span className="text-[11px] font-normal text-[var(--color-muted-ink)] line-through">{was}</span> : null}
          </p>
          {hasMeta ? (
            <p className="flex items-center gap-x-2 text-[11.5px] font-medium text-[var(--color-muted-ink)]">
              <SpiceLevel level={item.spiceLevel} />
              {item.dietaryTags.slice(0, 1).map((tag) => (
                <span key={tag} className="uppercase tracking-wide">
                  {tag}
                </span>
              ))}
              {showPrepTime ? <span className="tabular">{item.prepTimeMinutes} min</span> : null}
            </p>
          ) : null}
        </div>

        <div className="mt-auto pt-2.5">
          {item.isAvailable ? (
            <GridAddBar
              wide
              restaurantSlug={restaurantSlug}
              item={{
                id: item.id,
                name: item.name,
                slug: item.slug,
                requiresSelection: item.requiresSelection,
                isAvailable: item.isAvailable,
                basePrice: item.basePrice,
                imageUrl: image,
              }}
              orderType={orderType}
            />
          ) : (
            <p className="inline-flex min-h-10 items-center rounded-xl bg-[var(--tint-strong)] px-3.5 text-[12.5px] font-semibold text-[var(--color-muted-ink)]">
              {offAtBranch ? "Not at this branch" : "Sold out today"}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
