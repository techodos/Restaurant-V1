import Link from "next/link";
import { enabledOrderTypes } from "@/shared/ordering";
import { ArrowRight, ShoppingBag, Store, UtensilsCrossed } from "lucide-react";
import type { StorefrontContext } from "@/shared/contract/models";
import type { OrderTypeSwitchSection as SwitchConfig } from "@/shared/contract/sections";
import { ORDER_TYPE_LABELS, type OrderType } from "@/shared/contract/enums";
import { cn } from "@/shared/utils";
import { SectionHeading } from "@/components/storefront/section-heading";

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
 * Choosing an order type here primes the menu link with ?orderType=…, which the
 * menu page passes into the cart on the next add: one decision, applied once.
 * Rendered as a compact panel; right after a hero it overlaps the hero edge, so it reads as the next step.
 */
export function OrderTypeSwitchSection({
  section,
  context,
}: {
  section: SwitchConfig;
  context: StorefrontContext;
}) {
  const features = context.restaurant.features;
  const options = enabledOrderTypes(features, section.orderTypes);

  if (!options.length) return null;

  return (
    <section className="container-page relative z-10 py-10 [[data-after=hero]>&]:-mt-10 [[data-after=hero]>&]:pt-0 md:[[data-after=hero]>&]:-mt-14">
      <div className="surface-card grid gap-6 p-5 shadow-[var(--shadow-raised)] md:p-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,2fr)] lg:items-center">
        <SectionHeading
          title={section.title}
          subtitle={section.subtitle}
          className="[&_h2]:text-2xl [&_h2]:md:text-[1.75rem] [&_p]:mt-2 [&_p]:text-sm"
        />
        <ul className={cn("grid gap-3", options.length === 3 ? "sm:grid-cols-3" : options.length === 2 ? "sm:grid-cols-2" : "")}>
          {options.map((type) => {
            const Icon = ICONS[type];
            const eta = type === "delivery" ? context.restaurant.settings.delivery.defaultEtaMinutes : null;
            return (
              <li key={type}>
                <Link
                  href={`/r/${context.restaurant.slug}/menu?orderType=${type}`}
                  className="group flex h-full items-start gap-4 rounded-[var(--radius-card)] border border-[var(--color-hairline)] p-4 transition-[border-color,background-color,transform] duration-300 hover:border-[var(--color-brand)] hover:bg-[color-mix(in_srgb,var(--color-brand)_5%,transparent)] active:scale-[0.99] sm:flex-col sm:gap-3"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-[var(--radius-brand)] bg-[color-mix(in_srgb,var(--color-brand)_10%,transparent)] text-[var(--color-brand)] transition-colors group-hover:bg-[var(--color-brand)] group-hover:text-[var(--color-brand-foreground)]">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2 text-base font-semibold">
                      {ORDER_TYPE_LABELS[type]}
                      <ArrowRight
                        className="size-4 text-[var(--color-muted-ink)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--color-brand)]"
                        aria-hidden
                      />
                    </span>
                    <span className="mt-1 block text-sm leading-snug text-[var(--color-muted-ink)]">{BLURBS[type]}</span>
                    {eta ? <span className="mt-1.5 block text-xs font-medium text-[var(--color-brand)]">Around {eta} min</span> : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
