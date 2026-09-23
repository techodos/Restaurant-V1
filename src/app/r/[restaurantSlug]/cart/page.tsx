import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Info, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { ORDER_TYPE_LABELS } from "@/shared/contract/enums";
import { readCart, requireStorefront } from "@/web/storefront";
import { priceCart, serviceAvailability } from "@/server/services/cart";
import { resolveMenuImage } from "@/web/media";
import { formatMoney } from "@/shared/money";
import { enabledOrderTypes } from "@/shared/ordering";
import { Button } from "@/components/ui/button";
import { CartLineItem } from "@/components/storefront/cart-line-item";
import { CartPromoForm } from "@/components/storefront/cart-promo-form";
import { OrderTypePicker } from "@/components/storefront/order-type-picker";
import { CartCountSync } from "@/components/storefront/cart-count-sync";

interface CartPageProps {
  params: Promise<{ restaurantSlug: string }>;
}

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your cart", robots: { index: false, follow: false } };

export default async function CartPage({ params }: CartPageProps) {
  const { restaurantSlug } = await params;

  const context = await requireStorefront(restaurantSlug);

  const { restaurant, primaryLocation } = context;
  const cart = await readCart(restaurant);
  const availability = serviceAvailability(restaurant, primaryLocation, cart?.orderType ?? "delivery");

  if (!cart || cart.items.length === 0) {
    return (
      <div className="container-page py-20">
        <CartCountSync count={0} />
        <div className="mx-auto max-w-lg text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-brand)_10%,transparent)] text-[var(--color-brand)]">
            <ShoppingBag className="size-6" aria-hidden />
          </span>
          <h1 className="mt-6 text-2xl font-semibold">Your cart is empty</h1>
          <p className="mt-3 text-[var(--color-muted-ink)]">
            Add something from the menu and it will show up here — nothing is charged until you place the order.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link href={`/r/${restaurant.slug}/menu`}>Browse the menu</Link>
            </Button>
            {restaurant.features.reservations ? (
              <Button asChild size="lg" variant="outline">
                <Link href={`/r/${restaurant.slug}/reservation`}>
                  <UtensilsCrossed aria-hidden />
                  Book a table
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const { pricing, zone, coupon, blockers } = await priceCart(restaurant, cart);
  const availableTypes = enabledOrderTypes(restaurant.features);

  const canCheckout = Boolean(pricing) && availability.acceptsOrders && blockers.length === 0;
  const money = (value: string | number | { toString(): string }) =>
    formatMoney(value.toString(), { currency: restaurant.currencySymbol, locale: restaurant.locale });

  return (
    <div className="container-page py-10 md:py-14">
      <CartCountSync count={cart.itemCount} />
      <h1 className="text-3xl font-semibold md:text-4xl">Your cart</h1>
      <p className="mt-2 text-sm text-[var(--color-muted-ink)]">
        {cart.itemCount} item{cart.itemCount === 1 ? "" : "s"} · prices confirmed by the kitchen when you place the order
      </p>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1.6fr_1fr] lg:gap-14">
        <div>
          <div className="rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-5">
            <p className="text-sm font-semibold">How would you like your order?</p>
            <div className="mt-3">
              <OrderTypePicker restaurantSlug={restaurant.slug} current={cart.orderType} available={availableTypes} />
            </div>
            {zone ? (
              <p className="mt-3 text-sm text-[var(--color-muted-ink)]">
                {zone.name} · delivery {money(zone.deliveryFee)}
                {zone.freeDeliveryOver && Number(zone.freeDeliveryOver) > 0
                  ? ` · free over ${money(zone.freeDeliveryOver)}`
                  : ""}
                {zone.minOrderAmount && Number(zone.minOrderAmount) > 0
                  ? ` · minimum ${money(zone.minOrderAmount)}`
                  : ""}
              </p>
            ) : null}
          </div>

          <ul className="mt-6 rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] px-5">
            {cart.items.map((item) => (
              <CartLineItem
                key={item.id}
                restaurantSlug={restaurant.slug}
                item={item}
                image={resolveMenuImage(item.imageUrl, null)}
                currencySymbol={restaurant.currencySymbol}
                locale={restaurant.locale}
              />
            ))}
          </ul>

          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <Link
              href={`/r/${restaurant.slug}/menu`}
              className="text-sm font-medium text-[var(--color-brand)] underline-offset-4 hover:underline"
            >
              ← Add more items
            </Link>
            {restaurant.features.coupons ? (
              <div className="w-full sm:max-w-xs">
                <CartPromoForm restaurantSlug={restaurant.slug} appliedCode={coupon?.code ?? null} />
              </div>
            ) : null}
          </div>
        </div>

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-card)]">
            <h2 className="text-lg font-semibold">Order summary</h2>

            {pricing ? (
              <dl className="mt-4 space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-[var(--color-muted-ink)]">Subtotal</dt>
                  <dd>{money(pricing.subtotal)}</dd>
                </div>
                {Number(pricing.discount) > 0 ? (
                  <div className="flex justify-between text-emerald-700">
                    <dt>Discount{coupon ? ` (${coupon.code})` : ""}</dt>
                    <dd>− {money(pricing.discount)}</dd>
                  </div>
                ) : null}
                {cart.orderType === "delivery" ? (
                  <div className="flex justify-between">
                    <dt className="text-[var(--color-muted-ink)]">Delivery</dt>
                    <dd>{Number(pricing.deliveryFee) === 0 ? "Free" : money(pricing.deliveryFee)}</dd>
                  </div>
                ) : null}
                {Number(pricing.serviceFee) > 0 ? (
                  <div className="flex justify-between">
                    <dt className="text-[var(--color-muted-ink)]">Service fee</dt>
                    <dd>{money(pricing.serviceFee)}</dd>
                  </div>
                ) : null}
                <div className="flex justify-between">
                  <dt className="text-[var(--color-muted-ink)]">{pricing.taxLabel}</dt>
                  <dd>
                    {money(pricing.tax)}
                    {pricing.taxIncluded ? <span className="ml-1 text-xs">(included)</span> : null}
                  </dd>
                </div>
                <div className="flex justify-between border-t border-[var(--color-hairline)] pt-3 text-base font-semibold">
                  <dt>Total</dt>
                  <dd>{money(pricing.total)}</dd>
                </div>
              </dl>
            ) : (
              <p className="mt-4 text-sm text-[var(--color-muted-ink)]">
                We cannot price this cart yet — see the note below.
              </p>
            )}

            {blockers.length ? (
              <ul className="mt-4 space-y-2 rounded-[var(--radius-brand)] bg-amber-500/10 p-3 text-sm text-amber-800">
                {blockers.map((blocker) => (
                  <li key={blocker} className="flex gap-2">
                    <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                    {blocker}
                  </li>
                ))}
              </ul>
            ) : null}

            {!availability.acceptsOrders ? (
              <p className="mt-4 flex gap-2 rounded-[var(--radius-brand)] bg-[color-mix(in_srgb,var(--color-ink)_6%,transparent)] p-3 text-sm text-[var(--color-muted-ink)]">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                {availability.message}
              </p>
            ) : null}

            <div className="mt-5">
              {canCheckout ? (
                <Button asChild size="lg" className="w-full">
                  <Link href={`/r/${restaurant.slug}/checkout`}>
                    Checkout
                    <ArrowRight aria-hidden />
                  </Link>
                </Button>
              ) : (
                <Button size="lg" className="w-full" disabled>
                  Checkout
                </Button>
              )}
            </div>

            <p className="mt-3 text-center text-xs text-[var(--color-muted-ink)]">
              {cart.orderType === "delivery"
                ? "Delivery details are collected at checkout."
                : `${ORDER_TYPE_LABELS[cart.orderType]} orders never carry a delivery fee.`}
            </p>
          </div>

          {restaurant.settings.ordering.minimumOrderAmount > 0 ? (
            <p className="mt-3 text-center text-xs text-[var(--color-muted-ink)]">
              House minimum: {money(restaurant.settings.ordering.minimumOrderAmount.toFixed(2))}
            </p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
