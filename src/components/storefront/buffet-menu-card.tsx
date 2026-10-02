import type { MenuItem, Restaurant } from "@/shared/contract/models";
import type { BuffetMenu } from "@/shared/buffet-menu";
import { formatMoney, sumMoney, type MoneyInput } from "@/shared/money";
import { cn } from "@/shared/utils";

interface BuffetMenuCardProps {
  item: MenuItem;
  restaurant: Restaurant;
  menu: BuffetMenu;
  /** "sheet" sits in the side panel (two columns at most); "page" spreads to three */
  variant: "page" | "sheet";
}

/**
 * A buffet package (Hi-Tea, Dinner Buffet…) shown as the printed buffet card restaurants hand out: the
 * package name, the per-head prices (adult / children as the item's variants), then every station's
 * dishes in columns. Dishes are names only — a buffet has one price, not a price per dish.
 */
export function BuffetMenuCard({ item, restaurant, menu, variant }: BuffetMenuCardProps) {
  const money = (value: MoneyInput) => formatMoney(value, { currency: restaurant.currencySymbol, locale: restaurant.locale });
  const tax = restaurant.settings.tax;
  const plusTax = tax.enabled && !tax.included && tax.rate > 0 ? `+ ${tax.label.toLowerCase() === "sales tax" ? "tax" : tax.label}` : null;
  // variants are the price tiers (Adult / Children 3–10 years); no variants = one per-person price
  const tiers = item.variants.filter((variant) => variant.isAvailable);
  const prices = tiers.length
    ? tiers.map((variant) => ({
        label: variant.name,
        // same rule as domain/menu-selection: a "delta" variant is priced on top of the base price
        price: variant.priceMode === "delta" ? sumMoney([item.basePrice, variant.price]) : variant.price,
      }))
    : [{ label: "Per person", price: item.basePrice }];
  const [lead, ...rest] = prices;
  const dishCount = menu.sections.reduce((sum, section) => sum + section.items.length, 0);

  return (
    <article
      aria-label={`${item.name} menu`}
      className="relative overflow-hidden rounded-[var(--radius-card)] border border-[var(--rule-strong)] bg-[var(--color-canvas)]"
    >
      {/* a band of the brand colour down the spine, like the printed card's coloured column */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-[var(--color-brand)]" />

      <header className={cn("border-b border-[var(--rule)] pl-7 pr-5 pt-7 pb-6", variant === "page" && "md:pl-10 md:pr-8 md:pt-9")}>
        <p className="eyebrow">{restaurant.name}</p>
        <p className="mt-4 text-[13px] font-semibold uppercase tracking-[0.32em] text-[var(--color-muted-ink)]">Menu</p>
        <h2 className="mt-1 font-[family-name:var(--font-display)] text-[clamp(2rem,1.4rem+2.4vw,3.4rem)] uppercase leading-[0.95] tracking-[0.04em]">
          {item.name}
        </h2>

        {lead ? (
          <div className="mt-5 flex flex-wrap items-end gap-x-8 gap-y-3">
            <p className="flex items-baseline gap-3">
              <span className="text-[13px] font-semibold uppercase tracking-[0.2em] text-[var(--color-brand)]">{lead.label}</span>
              <span className="tabular font-[family-name:var(--font-display)] text-[clamp(2rem,1.5rem+2vw,3rem)] leading-none">
                {money(lead.price)}
              </span>
              {plusTax ? <span className="text-xs text-[var(--color-muted-ink)]">{plusTax}</span> : null}
            </p>
            {rest.map((tier) => (
              <p key={tier.label} className="flex items-baseline gap-2 text-[15px]">
                <span className="font-semibold uppercase tracking-[0.08em] text-[var(--color-brand)]">{tier.label}</span>
                <span className="tabular font-semibold">{money(tier.price)}</span>
                {plusTax ? <span className="text-xs text-[var(--color-muted-ink)]">{plusTax}</span> : null}
              </p>
            ))}
          </div>
        ) : null}
        {item.shortDescription ? <p className="mt-4 max-w-[60ch] text-[15px] text-[var(--color-muted-ink)]">{item.shortDescription}</p> : null}
      </header>

      <div
        className={cn(
          "gap-x-10 pl-7 pr-5 pt-6 pb-2",
          variant === "page" ? "sm:columns-2 lg:columns-3 md:pl-10 md:pr-8" : "sm:columns-2",
        )}
      >
        {menu.sections.map((section, index) => (
          <section key={`${section.title ?? "dishes"}-${index}`} className="mb-6 break-inside-avoid">
            {section.title ? (
              <h3 className="mb-2 text-[15px] font-bold uppercase tracking-[0.06em] text-[var(--color-brand)]">{section.title}</h3>
            ) : null}
            <ul className="space-y-1 text-[14.5px] leading-snug">
              {section.items.map((dish, dishIndex) => (
                <li key={`${dish}-${dishIndex}`}>{dish}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <footer className={cn("border-t border-[var(--rule)] pl-7 pr-5 py-4 text-[12px] text-[var(--color-muted-ink)]", variant === "page" && "md:pl-10 md:pr-8")}>
        {menu.notes.map((note) => (
          <p key={note}>{note}</p>
        ))}
        <p className="uppercase tracking-[0.12em]">
          {menu.sections.length} sections · {dishCount} dishes · menu items are subject to change without prior notice
        </p>
      </footer>
    </article>
  );
}
