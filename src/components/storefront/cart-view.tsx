import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Info, Plus, ShoppingBag } from "lucide-react";
import type { StorefrontContext } from "@/shared/contract/models";
import { ORDER_TYPE_LABELS } from "@/shared/contract/enums";
import { readCart } from "@/web/storefront";
import { getStorefrontCustomer } from "@/web/session";
import { signInHref } from "@/shared/return-to";
import { priceCart, serviceAvailability } from "@/server/services/cart";
import { resolveImage, resolveMenuImage } from "@/web/media";
import { formatMoney } from "@/shared/money";
import { enabledOrderTypes } from "@/shared/ordering";
import { cn } from "@/shared/utils";
import { Button } from "@/components/ui/button";
import { CartLineItem } from "./cart-line-item";
import { CartPromoForm } from "./cart-promo-form";
import { OrderTypePicker } from "./order-type-picker";
import { CartCountSync } from "./cart-count-sync";
import { EmptyState } from "./empty-state";

/**
 * The tray, shared by the full /cart page and the tray drawer (@modal/(.)cart). Reads the real cart and
 * prices it with the same services as before; only the presentation differs per variant.
 */
export async function CartView({ context, variant }: { context: StorefrontContext; variant: "page" | "drawer" }) {
  const { restaurant, primaryLocation } = context;
  const cart = await readCart(restaurant);
  const availability = serviceAvailability(restaurant, primaryLocation, cart?.orderType ?? "delivery");
  const drawer = variant === "drawer";
  const home = `/r/${restaurant.slug}`;

  if (!cart || cart.items.length === 0) {
    const cover = drawer ? null : resolveImage(restaurant.coverUrl);
    const empty = (
      <EmptyState
        icon={ShoppingBag}
        title="Your tray is empty"
        titleAs={drawer ? "h2" : "h1"}
        className={drawer ? "px-6 py-14" : "py-0"}
        actions={
          <>
            <Button asChild size="lg">
              <Link href={`${home}/menu`}>Browse the menu</Link>
            </Button>
            {restaurant.features.reservations ? (
              <Button asChild size="lg" variant="outline">
                <Link href={`${home}/reservation`}>Book a table</Link>
              </Button>
            ) : null}
          </>
        }
      >
        Add dishes from the menu and they land here. Nothing is charged until you place the order.
      </EmptyState>
    );
    if (drawer) return (
      <>
        <CartCountSync count={0} />
        {empty}
      </>
    );
    return (
      <section className="tone-night relative isolate grid min-h-[min(60svh,560px)] place-items-center overflow-hidden px-5 py-16">
        {cover ? (
          <>
            <Image src={cover} alt="" fill sizes="100vw" className="animate-hero -z-20 object-cover" />
            <span aria-hidden className="absolute inset-0 -z-10 bg-black/65" />
          </>
        ) : null}
        <CartCountSync count={0} />
        {empty}
      </section>
    );
  }

  const [{ pricing, zone, coupon, blockers }, customer] = await Promise.all([
    priceCart(restaurant, cart),
    getStorefrontCustomer(restaurant.id).catch(() => null),
  ]);
  const availableTypes = enabledOrderTypes(restaurant.features);
  const canCheckout = Boolean(pricing) && availability.acceptsOrders && blockers.length === 0;
  const money = (value: string | number | { toString(): string }) =>
    formatMoney(value.toString(), { currency: restaurant.currencySymbol, locale: restaurant.locale });

  const lines = (
    <ul className="divide-y divide-[var(--rule)]">
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
  );

  const service = (
    <div>
      {availableTypes.length > 1 ? (
        <OrderTypePicker restaurantSlug={restaurant.slug} current={cart.orderType} available={availableTypes} />
      ) : null}
      {zone ? (
        <p className="mt-3 text-[13px] leading-relaxed text-[var(--color-muted-ink)]">
          Delivering to {zone.name}: {Number(zone.deliveryFee) === 0 ? "free delivery" : `${money(zone.deliveryFee)} delivery`}
          {zone.freeDeliveryOver && Number(zone.freeDeliveryOver) > 0 ? `, free over ${money(zone.freeDeliveryOver)}` : ""}
          {zone.minOrderAmount && Number(zone.minOrderAmount) > 0 ? `, minimum ${money(zone.minOrderAmount)}` : ""}.
        </p>
      ) : cart.orderType !== "delivery" ? (
        <p className="mt-3 text-[13px] text-[var(--color-muted-ink)]">
          {ORDER_TYPE_LABELS[cart.orderType]} orders never carry a delivery fee.
        </p>
      ) : null}
    </div>
  );

  const receipt = pricing ? (
    <dl className="tabular space-y-2.5 text-sm">
      <div className="flex justify-between">
        <dt className="text-[var(--color-muted-ink)]">Subtotal</dt>
        <dd>{money(pricing.subtotal)}</dd>
      </div>
      {Number(pricing.discount) > 0 ? (
        <div className="flex justify-between text-[var(--color-success)]">
          <dt>Discount{coupon ? ` (${coupon.code})` : ""}</dt>
          <dd>-{money(pricing.discount)}</dd>
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
        <dt className="text-[var(--color-muted-ink)]">
          {pricing.taxLabel}
          {pricing.taxIncluded ? " (included)" : ""}
        </dt>
        <dd>{money(pricing.tax)}</dd>
      </div>
      <div className="flex items-baseline justify-between border-t border-dashed border-[var(--rule-strong)] pt-3.5 text-lg font-semibold">
        <dt>Total</dt>
        <dd>{money(pricing.total)}</dd>
      </div>
    </dl>
  ) : (
    <p className="text-sm text-[var(--color-muted-ink)]">We cannot price this tray yet. See the note below.</p>
  );

  const notices = (
    <>
      {!customer ? (
        <p className="flex gap-2 rounded-[var(--radius-card)] bg-[var(--steel-2)] p-3.5 text-sm text-[var(--color-muted-ink)]">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          Orders are placed from an account with a verified email. Your tray is kept while you sign in.
        </p>
      ) : null}
      {blockers.length ? (
        <ul className="space-y-2 rounded-[var(--radius-card)] bg-[color-mix(in_srgb,var(--color-warning)_12%,transparent)] p-3.5 text-sm text-[color-mix(in_srgb,var(--color-warning)_70%,var(--color-ink))]">
          {blockers.map((blocker) => (
            <li key={blocker} className="flex gap-2">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              {blocker}
            </li>
          ))}
        </ul>
      ) : null}
      {!availability.acceptsOrders ? (
        <p className="flex gap-2 rounded-[var(--radius-card)] bg-[var(--steel-2)] p-3.5 text-sm text-[var(--color-muted-ink)]">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          {availability.message}
        </p>
      ) : null}
    </>
  );

  // orders need a signed-in, verified account (placeOrderAction enforces it); a guest signs in first and
  // comes straight back to checkout
  const checkoutHref = customer ? `${home}/checkout` : signInHref(restaurant.slug, `${home}/checkout`);
  const checkout = canCheckout ? (
    <Button asChild size="lg" className="h-13 w-full justify-between rounded-full px-6">
      <Link href={checkoutHref}>
        <span>{customer ? "Checkout" : "Sign in to check out"}</span>
        <span className="tabular flex items-center gap-2">
          {pricing ? money(pricing.total) : null}
          <ArrowRight aria-hidden />
        </span>
      </Link>
    </Button>
  ) : (
    <Button size="lg" className="h-13 w-full rounded-full" disabled>
      Checkout
    </Button>
  );

  if (drawer) {
    return (
      <div className="flex min-h-full flex-col">
        <CartCountSync count={cart.itemCount} />
        <div className="flex-1 space-y-6 px-5 md:px-7">
          {service}
          {lines}
          {restaurant.features.coupons ? <CartPromoForm restaurantSlug={restaurant.slug} appliedCode={coupon?.code ?? null} /> : null}
          <div className="rounded-[var(--radius-card)] bg-[var(--steel-1)] p-5">{receipt}</div>
          {notices}
        </div>
        <div className="sticky bottom-0 mt-6 border-t border-[var(--rule)] bg-[color-mix(in_srgb,var(--color-surface)_94%,transparent)] px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl md:px-7">
          {checkout}
          <Link href={`${home}/cart`} className="mt-2 block text-center text-xs font-medium text-[var(--color-muted-ink)] hover:text-[var(--color-ink)]">
            Open full tray
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page pb-12 pt-6 md:pb-16 md:pt-10">
      <CartCountSync count={cart.itemCount} />
      <header className="border-b border-[var(--rule)] pb-6">
        <p className="eyebrow mb-3">Your order</p>
        <h1 className="display-1">Your tray</h1>
        <p className="tabular mt-3 text-[15px] text-[var(--color-muted-ink)]">
          {cart.itemCount} item{cart.itemCount === 1 ? "" : "s"}. Prices are confirmed when you place the order.
        </p>
      </header>

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-12">
        <div>
          {service}
          <div className="mt-4">{lines}</div>
          <div className="mt-2 flex flex-col gap-6 border-t border-[var(--rule)] pt-6 sm:flex-row sm:items-start sm:justify-between">
            <Link
              href={`${home}/menu`}
              className="press inline-flex h-10 w-fit items-center gap-1.5 rounded-full border border-[var(--rule-strong)] px-4 text-sm font-semibold"
            >
              <Plus className="size-4" aria-hidden />
              Add more dishes
            </Link>
            {restaurant.features.coupons ? (
              <div className="w-full sm:max-w-xs">
                <CartPromoForm restaurantSlug={restaurant.slug} appliedCode={coupon?.code ?? null} />
              </div>
            ) : null}
          </div>
        </div>

        <aside className="lg:sticky lg:top-[calc(var(--header-h,4.5rem)+1.5rem)] lg:self-start">
          <div className="tone-night rounded-[var(--radius-panel)] p-6 shadow-[var(--shadow-raised)] md:p-8">
            <h2 className="display-3">Order summary</h2>
            <p className="tabular mt-1 text-[13px] text-[var(--color-muted-ink)]">
              {ORDER_TYPE_LABELS[cart.orderType]} · {cart.itemCount} item{cart.itemCount === 1 ? "" : "s"}
            </p>
            <span aria-hidden className="mt-5 block h-px bg-[var(--rule)]" />
            <div className="mt-4">{receipt}</div>
            <div className="mt-5 space-y-3">{notices}</div>
            <div className="mt-6 hidden lg:block">{checkout}</div>
            {restaurant.settings.ordering.minimumOrderAmount > 0 ? (
              <p className="tabular mt-3 text-center text-xs text-[var(--color-muted-ink)]">
                Minimum order {money(restaurant.settings.ordering.minimumOrderAmount.toFixed(2))}
              </p>
            ) : null}
          </div>
        </aside>
      </div>

      {/* phones: the next action stays under the thumb */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--rule)] bg-[color-mix(in_srgb,var(--color-surface)_94%,transparent)] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl lg:hidden">
        {checkout}
      </div>
    </div>
  );
}
