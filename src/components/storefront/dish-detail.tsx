import Image from "next/image";
import { Clock, Flame, Info, Leaf } from "lucide-react";
import type { MenuItem, StorefrontContext } from "@/shared/contract/models";
import type { OrderType } from "@/shared/contract/enums";
import { resolveMenuImage } from "@/web/media";
import { formatMoney } from "@/shared/money";
import { cn } from "@/shared/utils";
import { ItemCustomizer } from "./item-customizer";

interface DishDetailProps {
  context: StorefrontContext;
  item: MenuItem;
  orderType: OrderType;
  /** "page": split layout on a full route; "sheet": stacked inside the dish sheet */
  variant: "page" | "sheet";
}

/** One dish, everything the database knows about it, and the customizer. Shared by the page and the sheet. */
export function DishDetail({ context, item, orderType, variant }: DishDetailProps) {
  const { restaurant } = context;
  const image = resolveMenuImage(item.imageUrl, null);
  const money = (value: string) => formatMoney(value, { currency: restaurant.currencySymbol, locale: restaurant.locale });
  const sheet = variant === "sheet";

  const facts = [
    { icon: Clock, label: "Ready in", value: `${item.prepTimeMinutes} min` },
    item.calories ? { icon: Leaf, label: "Energy", value: `${item.calories} kcal` } : null,
    item.spiceLevel > 0 ? { icon: Flame, label: "Heat", value: `${item.spiceLevel} of 3` } : null,
  ].filter((fact): fact is NonNullable<typeof fact> => Boolean(fact));

  const photo = (
    <div className={cn("plate", sheet ? "aspect-[4/3] rounded-none md:mx-7 md:rounded-[var(--radius-card)]" : "aspect-square lg:aspect-[4/5]")}>
      {image ? (
        <Image
          src={image}
          alt={item.name}
          fill
          priority
          data-dish-image={item.slug}
          sizes={sheet ? "(min-width: 768px) 560px, 100vw" : "(min-width: 1024px) 600px, 100vw"}
          className="object-cover"
        />
      ) : (
        <span aria-hidden className="grid h-full place-items-center font-[family-name:var(--font-display)] text-6xl text-[var(--color-muted-ink)]">
          {item.name.slice(0, 1)}
        </span>
      )}
      {!item.isAvailable ? (
        <span className="absolute left-4 top-4 rounded-full bg-[var(--color-ink)] px-3 py-1 text-xs font-semibold text-[var(--color-canvas)]">
          Sold out today
        </span>
      ) : null}
    </div>
  );

  const body = (
    <div className={cn(sheet ? "px-5 pt-5 md:px-7" : "")}>
      <h1 className={cn("font-semibold leading-[1.04]", sheet ? "text-[1.9rem]" : "text-[2.4rem] md:text-[3.2rem]")}>{item.name}</h1>
      <p className="tabular mt-3 flex items-baseline gap-3 text-xl font-semibold">
        {money(item.basePrice)}
        {item.compareAtPrice ? (
          <span className="text-base font-normal text-[var(--color-muted-ink)] line-through">{money(item.compareAtPrice)}</span>
        ) : null}
        {item.variants.length ? (
          <span className="text-sm font-normal text-[var(--color-muted-ink)]">
            {item.variants.length} size{item.variants.length === 1 ? "" : "s"}
          </span>
        ) : null}
      </p>
      {item.description ? (
        <p className="mt-4 max-w-[60ch] text-[15px] leading-relaxed text-[var(--color-muted-ink)] md:text-base">{item.description}</p>
      ) : null}

      <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3 border-y border-[var(--rule)] py-4 text-sm">
        {facts.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center gap-2">
            <Icon className="size-4 text-[var(--color-muted-ink)]" aria-hidden />
            <dt className="sr-only">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
        {item.dietaryTags.length ? (
          <div className="flex items-center gap-2">
            <dt className="sr-only">Dietary</dt>
            <dd className="flex flex-wrap gap-1.5">
              {item.dietaryTags.map((tag) => (
                <span key={tag} className="rounded-full bg-[var(--steel-2)] px-2.5 py-0.5 text-xs font-medium">
                  {tag}
                </span>
              ))}
            </dd>
          </div>
        ) : null}
      </dl>
      {item.allergens.length ? (
        <p className="mt-3 text-[13px] text-[var(--color-muted-ink)]">Contains {item.allergens.join(", ")}.</p>
      ) : null}

      <div className="mt-8">
        <ItemCustomizer
          restaurantSlug={restaurant.slug}
          item={item}
          currencySymbol={restaurant.currencySymbol}
          locale={restaurant.locale}
          orderType={orderType}
          inSheet={sheet}
        />
      </div>

      {!item.isAvailable ? (
        <p className="mt-4 flex items-start gap-2 text-sm text-[var(--color-muted-ink)]">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          This dish is unavailable today. Everything else on the menu is still open.
        </p>
      ) : null}
    </div>
  );

  if (sheet) {
    return (
      <div className="pb-2">
        {photo}
        {body}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12">
      <div className="lg:sticky lg:top-[calc(var(--header-h,4.5rem)+1.5rem)] lg:self-start">{photo}</div>
      {body}
    </div>
  );
}
