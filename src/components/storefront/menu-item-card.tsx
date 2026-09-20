import Link from "next/link";
import Image from "next/image";
import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/shared/money";
import { resolveMenuImage } from "@/web/media";
import type { MenuItemSummary } from "@/shared/contract/models";
import { QuickAddButton } from "./quick-add-button";

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
    <article className="group flex h-full flex-col overflow-hidden rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-raised)]">
      <Link href={detailHref} className="relative block aspect-4/3 overflow-hidden bg-[color-mix(in_srgb,var(--color-ink)_6%,transparent)]">
        {image ? (
          <Image
            src={image}
            alt={item.name}
            fill
            sizes="(min-width: 1024px) 320px, (min-width: 640px) 45vw, 90vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <span className="grid h-full place-items-center text-3xl font-semibold text-[var(--color-muted-ink)]" aria-hidden>
            {item.name.slice(0, 1)}
          </span>
        )}
        {!item.isAvailable ? (
          <span className="absolute inset-0 grid place-items-center bg-black/55 text-sm font-semibold text-white">
            Sold out today
          </span>
        ) : null}
        {item.compareAtPrice ? (
          <Badge variant="danger" className="absolute left-3 top-3">
            Save {formatMoney(item.compareAtPrice, { currency: currencySymbol, locale })}
          </Badge>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex-1 space-y-1.5">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-base font-semibold leading-snug">
              <Link href={detailHref} className="hover:text-[var(--color-brand)]">
                {item.name}
              </Link>
            </h3>
            <p className="whitespace-nowrap font-semibold text-[var(--color-brand)]">{price}</p>
          </div>
          {item.description ? (
            <p className="line-clamp-2 text-sm text-[var(--color-muted-ink)]">{item.description}</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            {item.dietaryTags.slice(0, 2).map((tag) => (
              <Badge key={tag} variant="soft">
                {tag}
              </Badge>
            ))}
            {item.spiceLevel > 0 ? (
              <Badge variant="warning" aria-label={`Spice level ${item.spiceLevel} of 3`}>
                {"🌶".repeat(Math.min(item.spiceLevel, 3))}
              </Badge>
            ) : null}
            {showPrepTime ? (
              <span className="inline-flex items-center gap-1 text-xs text-[var(--color-muted-ink)]">
                <Clock className="size-3.5" aria-hidden />
                {item.prepTimeMinutes} min
              </span>
            ) : null}
          </div>
        </div>

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
    </article>
  );
}
