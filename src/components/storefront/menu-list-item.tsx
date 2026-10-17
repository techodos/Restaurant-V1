import Link from "next/link";
import { formatMoney } from "@/shared/money";
import { resolveMenuImage } from "@/web/media";
import type { MenuItemSummary } from "@/shared/contract/models";
import { cn } from "@/shared/utils";
import { QuickAddButton } from "./quick-add-button";
import { SpiceLevel } from "./spice-level";

/**
 * One dish as a line of a printed menu (the "list" menu layout): name, dotted leader, price, the
 * description, and the menu's own add control. No photograph on the line — the same QuickAddButton as
 * every other tile, so add, the options sheet, sold out and branch rules are unchanged.
 */
export function MenuListItem({
  item,
  restaurantSlug,
  currencySymbol,
  locale,
  orderType,
  offAtBranch = false,
  showPrepTime = false,
}: {
  item: MenuItemSummary;
  restaurantSlug: string;
  currencySymbol: string;
  locale: string;
  orderType?: string | undefined;
  offAtBranch?: boolean;
  showPrepTime?: boolean;
}) {
  if (offAtBranch) item = { ...item, isAvailable: false };
  const href = `/menu/${item.slug}${orderType ? `?orderType=${orderType}` : ""}`;
  const price = formatMoney(item.priceFrom, { currency: currencySymbol, locale, compact: false });
  const was = item.compareAtPrice ? formatMoney(item.compareAtPrice, { currency: currencySymbol, locale }) : null;
  const hasMeta = item.dietaryTags.length > 0 || item.spiceLevel > 0 || showPrepTime;

  return (
    <article data-dish={item.slug} className={cn("py-5", !item.isAvailable && "opacity-60")}>
      <div className="flex items-baseline gap-3">
        <h3 className="min-w-0 font-[family-name:var(--font-display)] text-[1.15rem] leading-snug md:text-[1.25rem]">
          <Link href={href} scroll={false} className="transition-colors duration-200 hover:text-[var(--color-brand)]">
            {item.name}
          </Link>
        </h3>
        <span aria-hidden className="min-w-6 flex-1 -translate-y-1 border-b border-dotted border-[var(--rule-strong)]" />
        <p className="tabular shrink-0 text-[15px] font-semibold">
          {was ? <span className="mr-2 text-xs font-normal text-[var(--color-muted-ink)] line-through">{was}</span> : null}
          {price}
        </p>
      </div>
      <div className="mt-1.5 flex items-start justify-between gap-6">
        <div className="min-w-0">
          {item.description ? (
            <p className="line-clamp-2 max-w-[52ch] text-[13.5px] leading-relaxed text-[var(--color-muted-ink)]">{item.description}</p>
          ) : null}
          {hasMeta || !item.isAvailable ? (
            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted-ink)]">
              {!item.isAvailable ? <span className="text-[var(--color-ink)]">{offAtBranch ? "Not at this branch" : "Sold out today"}</span> : null}
              {item.dietaryTags.slice(0, 2).map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
              <SpiceLevel level={item.spiceLevel} />
              {showPrepTime ? <span className="tabular normal-case tracking-normal">{item.prepTimeMinutes} min</span> : null}
            </p>
          ) : null}
        </div>
        <div className="shrink-0">
          <QuickAddButton
            restaurantSlug={restaurantSlug}
            item={{
              id: item.id,
              name: item.name,
              slug: item.slug,
              requiresSelection: item.requiresSelection,
              isAvailable: item.isAvailable,
              basePrice: item.basePrice,
              imageUrl: resolveMenuImage(item.imageUrl, item.categorySlug),
            }}
            orderType={orderType}
            compact
          />
        </div>
      </div>
    </article>
  );
}
