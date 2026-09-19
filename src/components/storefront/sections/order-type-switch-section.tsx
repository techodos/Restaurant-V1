import Link from "next/link";
import { ShoppingBag, Store, UtensilsCrossed } from "lucide-react";
import type { StorefrontContext } from "@/lib/contract/models";
import type { OrderTypeSwitchSection as SwitchConfig } from "@/lib/contract/sections";
import { ORDER_TYPE_LABELS, type OrderType } from "@/lib/contract/enums";
import { SectionHeading } from "../section-heading";
import { SectionShell } from "../section-shell";

const ICONS: Record<OrderType, typeof ShoppingBag> = {
  delivery: ShoppingBag,
  pickup: Store,
  dine_in: UtensilsCrossed,
};

const BLURBS: Record<OrderType, string> = {
  delivery: "Hot to your door, tracked from the kitchen.",
  pickup: "Skip the queue — ready when you arrive.",
  dine_in: "Order at the table or ahead of your visit.",
};

/**
 * Choosing an order type here primes the menu link with ?orderType=…, which the
 * menu page passes into the cart on the next add — one decision, applied once.
 */
export function OrderTypeSwitchSection({
  section,
  context,
}: {
  section: SwitchConfig;
  context: StorefrontContext;
}) {
  const features = context.restaurant.features;
  const options = section.orderTypes.filter((type) => {
    if (type === "delivery") return features.delivery;
    if (type === "pickup") return features.pickup;
    return features.dineIn;
  });

  if (!options.length) return null;

  return (
    <SectionShell>
      <SectionHeading title={section.title} subtitle={section.subtitle} align="center" />
      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((type) => {
          const Icon = ICONS[type];
          const eta = type === "delivery" ? context.restaurant.settings.delivery.defaultEtaMinutes : null;
          return (
            <li key={type}>
              <Link
                href={`/r/${context.restaurant.slug}/menu?orderType=${type}`}
                className="flex h-full flex-col gap-3 rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-6 transition-colors hover:border-[var(--color-brand)]"
              >
                <span className="grid size-11 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-brand)_10%,transparent)] text-[var(--color-brand)]">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="text-lg font-semibold">{ORDER_TYPE_LABELS[type]}</span>
                <span className="text-sm text-[var(--color-muted-ink)]">{BLURBS[type]}</span>
                {eta ? <span className="text-xs text-[var(--color-muted-ink)]">Around {eta} minutes</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </SectionShell>
  );
}
