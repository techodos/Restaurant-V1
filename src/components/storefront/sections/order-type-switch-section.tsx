import Link from "next/link";
import { enabledOrderTypes } from "@/shared/ordering";
import { ArrowRight, ShoppingBag, Store, UtensilsCrossed } from "lucide-react";
import type { StorefrontContext } from "@/shared/contract/models";
import type { OrderTypeSwitchSection as SwitchConfig } from "@/shared/contract/sections";
import { ORDER_TYPE_LABELS, type OrderType } from "@/shared/contract/enums";
import { cn } from "@/shared/utils";

const ICONS: Record<OrderType, typeof ShoppingBag> = {
  delivery: ShoppingBag,
  pickup: Store,
  dine_in: UtensilsCrossed,
};

const BLURBS: Record<OrderType, string> = {
  delivery: "Hot to your door, tracked from the kitchen.",
  pickup: "Skip the queue. Ready when you arrive.",
  dine_in: "Order at the table or ahead of your visit.",
};

/**
 * Three doors into the menu, one per enabled order type. Choosing one primes the menu link with
 * ?orderType=…, which the menu passes into the cart on the next add. Right after a hero the doors
 * join its bottom edge as one band; elsewhere they stand as their own strip.
 */
export function OrderTypeSwitchSection({ section, context }: { section: SwitchConfig; context: StorefrontContext }) {
  const options = enabledOrderTypes(context.restaurant.features, section.orderTypes);
  if (!options.length) return null;

  return (
    <section aria-label={section.title} className="tone-night border-t border-[var(--rule)] [[data-after=hero]>&]:border-t-[color-mix(in_srgb,var(--color-on-night)_10%,transparent)]">
      <div className="container-page">
        <h2 className="sr-only">{section.title}</h2>
        <ul
          className={cn(
            "grid divide-y divide-[var(--rule)] sm:divide-x sm:divide-y-0",
            options.length === 3 ? "sm:grid-cols-3" : options.length === 2 ? "sm:grid-cols-2" : "",
          )}
        >
          {options.map((type) => {
            const Icon = ICONS[type];
            const eta = type === "delivery" ? context.restaurant.settings.delivery.defaultEtaMinutes : null;
            return (
              <li key={type}>
                <Link
                  href={`/r/${context.restaurant.slug}/menu?orderType=${type}`}
                  className="group flex h-full items-center gap-4 py-5 sm:px-6 sm:py-7 sm:first:pl-0 lg:px-10 lg:first:pl-0"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-full border border-[var(--rule-strong)] text-[var(--color-brand-accent)] transition-colors duration-300 group-hover:border-[var(--color-brand-accent)]">
                    <Icon className="size-[18px]" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="display-3 block">{ORDER_TYPE_LABELS[type]}</span>
                    <span className="mt-1 block text-[13px] leading-snug text-[var(--color-muted-ink)]">
                      {BLURBS[type]}
                      {eta ? <span className="tabular"> About {eta} min.</span> : null}
                    </span>
                  </span>
                  <ArrowRight
                    className="size-5 shrink-0 text-[var(--color-muted-ink)] transition-[transform,color] duration-300 group-hover:translate-x-1 group-hover:text-[var(--color-ink)]"
                    aria-hidden
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
