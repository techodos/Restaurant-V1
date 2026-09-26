import Link from "next/link";
import Image from "next/image";
import { formatMoney } from "@/shared/money";
import { resolveMenuImage } from "@/web/media";
import type { MenuItemSummary } from "@/shared/contract/models";
import { cn } from "@/shared/utils";
import { QuickAddButton } from "./quick-add-button";
import { SpiceLevel } from "./spice-level";

interface DishTileProps {
  item: MenuItemSummary;
  restaurantSlug: string;
  currencySymbol: string;
  locale: string;
  showPrepTime?: boolean;
  orderType?: string | undefined;
  /**
   * "card": photograph above a text panel (featured rails, related dishes).
   * "row": the printed-menu line: name, dotted leader, price, description, thumbnail (menu chapters).
   */
  layout?: "card" | "row";
  /** larger type for signature placements */
  size?: "md" | "lg";
}

/**
 * One dish. The photograph and the name open the dish sheet (intercepted route); the add control adds a
 * simple dish straight to the cart, or opens the sheet when the dish needs a choice.
 */
export function DishTile({
  item,
  restaurantSlug,
  currencySymbol,
  locale,
  showPrepTime = false,
  orderType,
  layout = "card",
  size = "md",
}: DishTileProps) {
  const image = resolveMenuImage(item.imageUrl, item.categorySlug);
  const href = `/r/${restaurantSlug}/menu/${item.slug}${orderType ? `?orderType=${orderType}` : ""}`;
  const price = formatMoney(item.priceFrom, { currency: currencySymbol, locale, compact: false });
  const add = (
    <QuickAddButton
      restaurantSlug={restaurantSlug}
      item={{ id: item.id, name: item.name, slug: item.slug, requiresSelection: item.requiresSelection, isAvailable: item.isAvailable }}
      orderType={orderType}
      compact={layout === "row"}
    />
  );
  const badge = !item.isAvailable ? (
    <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/75 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white backdrop-blur">
      Sold out today
    </span>
  ) : item.compareAtPrice ? (
    <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-[var(--color-brand-accent)] px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[var(--color-brand-accent-foreground)]">
      Offer
    </span>
  ) : null;
  const meta =
    item.dietaryTags.length || item.spiceLevel > 0 || showPrepTime ? (
      <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] font-medium uppercase tracking-[0.1em] text-[var(--color-muted-ink)]">
        {item.dietaryTags.slice(0, 2).map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
        <SpiceLevel level={item.spiceLevel} />
        {showPrepTime ? <span className="tabular normal-case tracking-normal">{item.prepTimeMinutes} min</span> : null}
      </p>
    ) : null;
  const was = item.compareAtPrice ? (
    <span className="ml-1.5 text-xs font-normal text-[var(--color-muted-ink)] line-through">
      {formatMoney(item.compareAtPrice, { currency: currencySymbol, locale })}
    </span>
  ) : null;

  if (layout === "row") {
    return (
      <article data-dish={item.slug} className="group grid grid-cols-[minmax(0,1fr)_auto] gap-4 py-6 sm:gap-6">
        <div className="min-w-0">
          <div className="flex items-baseline gap-3">
            <h3 className="min-w-0 font-[family-name:var(--font-display)] text-[1.2rem] leading-snug md:text-[1.3rem]">
              <Link href={href} scroll={false} className="transition-colors duration-200 hover:text-[var(--color-brand-accent)]">
                {item.name}
              </Link>
            </h3>
            <span aria-hidden className="hidden min-w-6 flex-1 translate-y-[-4px] border-b border-dotted border-[var(--rule-strong)] sm:block" />
            <p className="tabular shrink-0 text-[15px] font-semibold">
              {price}
              {was}
            </p>
          </div>
          {item.description ? (
            <p className="mt-1.5 line-clamp-2 max-w-[56ch] text-[14px] leading-relaxed text-[var(--color-muted-ink)]">{item.description}</p>
          ) : null}
          {meta}
        </div>
        <div className="relative size-24 shrink-0 sm:size-28">
          <Link
            href={href}
            scroll={false}
            tabIndex={-1}
            aria-hidden
            className="plate block !aspect-square size-full"
          >
            {image ? (
              <Image
                src={image}
                alt=""
                fill
                sizes="112px"
                className={cn("zoom-on-hover object-cover", !item.isAvailable && "grayscale")}
              />
            ) : (
              <span className="grid h-full place-items-center font-[family-name:var(--font-display)] text-3xl text-[var(--color-muted-ink)]">
                {item.name.slice(0, 1)}
              </span>
            )}
          </Link>
          <div className="absolute -bottom-2 -right-2">{add}</div>
        </div>
      </article>
    );
  }

  return (
    <article
      data-dish={item.slug}
      className="group flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-hairline)] bg-[var(--color-surface)] transition-[border-color,box-shadow,transform] duration-300 [@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:shadow-[var(--shadow-card)]"
    >
      <div className="plate reveal-plate !rounded-none">
        <Link href={href} scroll={false} tabIndex={-1} aria-hidden className="absolute inset-0">
          {image ? (
            <Image
              src={image}
              alt=""
              fill
              sizes={size === "lg" ? "(min-width: 1280px) 300px, (min-width: 640px) 45vw, 78vw" : "(min-width: 1024px) 300px, (min-width: 640px) 33vw, 50vw"}
              className={cn("zoom-on-hover object-cover", !item.isAvailable && "grayscale")}
            />
          ) : (
            <span aria-hidden className="grid h-full place-items-center font-[family-name:var(--font-display)] text-5xl text-[var(--color-muted-ink)]">
              {item.name.slice(0, 1)}
            </span>
          )}
        </Link>
        {badge}
        <div className="absolute bottom-3 right-3">{add}</div>
      </div>

      <div className="flex flex-1 flex-col p-4 md:p-5">
        <h3 className={cn("font-semibold leading-snug", size === "lg" ? "text-[1.05rem]" : "text-[15px]")} style={{ fontFamily: "var(--font-sans)" }}>
          <Link href={href} scroll={false} className="transition-colors duration-200 hover:text-[var(--color-brand)]">
            {item.name}
          </Link>
        </h3>
        {item.description ? (
          <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-[var(--color-muted-ink)]">{item.description}</p>
        ) : null}
        {meta}
        <p className="tabular mt-auto pt-4 text-[15px] font-semibold">
          {price}
          {was}
        </p>
      </div>
    </article>
  );
}
