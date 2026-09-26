import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, MapPin, Phone, Receipt, SearchX, Store } from "lucide-react";
import { EmptyState } from "@/components/storefront/empty-state";
import { ORDER_TYPE_LABELS, PAYMENT_METHOD_LABELS } from "@/shared/contract/enums";
import { getVisitorContext } from "@/web/session";
import { requireStorefront } from "@/web/storefront";
import { trackOrder } from "@/server/services/orders";
import { getPushClientConfigFor } from "@/server/services/notifications";
import { describeEta } from "@/shared/order-timeline";
import { formatMoney } from "@/shared/money";
import { Button } from "@/components/ui/button";
import { LiveOrderTimeline, OrderLiveProvider, OrderLiveStatus, OrderPass, OrderReceivedNotice } from "@/components/storefront/order-live-status";
import { PushOptIn } from "@/components/storefront/push-opt-in";
import { ReorderButton } from "@/components/storefront/reorder-button";
import { JsonLd } from "@/components/storefront/json-ld";

interface OrderPageProps {
  params: Promise<{ restaurantSlug: string; orderNumber: string }>;
  /** `t`: signed order-access token from a notification email; lets the link work from any device */
  searchParams: Promise<{ t?: string }>;
}

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Order status", robots: { index: false, follow: false } };

/**
 * Order tracking.
 *
 * Access is decided by the database, not this page: the RLS policy from
 * migration 0008 lets a guest read an order only from the browser that placed it
 * (the cart cookie), so an order number alone reveals nothing. Signed-in
 * customers get their own orders through the same policy set.
 */
export default async function OrderStatusPage({ params, searchParams }: OrderPageProps) {
  const { restaurantSlug, orderNumber } = await params;
  const { t: accessToken } = await searchParams;

  const context = await requireStorefront(restaurantSlug);

  const visitor = await getVisitorContext(context.restaurant.id);
  const order = await trackOrder(context.restaurant.id, decodeURIComponent(orderNumber), visitor, accessToken);
  if (!order) {
    return (
      <div className="container-page py-12 md:py-16">
        <EmptyState
          icon={SearchX}
          title="We cannot show this order"
          titleAs="h1"
          actions={
            <>
              <Button asChild size="lg">
                <Link href={`/r/${context.restaurant.slug}/menu`}>Back to the menu</Link>
              </Button>
              {context.restaurant.phone ? (
                <Button asChild size="lg" variant="outline">
                  <a href={`tel:${context.restaurant.phone.replace(/s+/g, "")}`}>
                    <Phone aria-hidden />
                    Call us
                  </a>
                </Button>
              ) : null}
            </>
          }
        >
          Orders are visible from the device that placed them. If you ordered from another phone or browser, call{" "}
          {context.restaurant.phone ?? "the restaurant"} with your order number and we will look it up.
        </EmptyState>
      </div>
    );
  }

  const { restaurant } = context;
  // null unless Firebase is fully configured AND the restaurant has push on (features), in which case the opt-in is not offered
  const pushConfig = getPushClientConfigFor(restaurant);
  const money = (value: string) => formatMoney(value, { currency: restaurant.currencySymbol, locale: restaurant.locale });
  const eta =
    order.status === "completed" || order.status === "cancelled" ? null : describeEta(order.estimatedReadyAt);
  const placedAt = new Date(order.createdAt);

  return (
    <OrderLiveProvider
      restaurantSlug={restaurant.slug}
      orderNumber={order.orderNumber}
      accessToken={accessToken}
      initial={{
        status: order.status,
        paymentStatus: order.paymentStatus,
        estimatedReadyAt: order.estimatedReadyAt,
        updatedAt: order.updatedAt,
      }}
      history={order.statusHistory ?? []}
      orderType={order.orderType}
    >
      <div className="pb-12 md:pb-16">
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "Order",
            orderNumber: order.orderNumber,
            orderStatus: `https://schema.org/Order${order.status === "completed" ? "Delivered" : "Processing"}`,
            priceCurrency: restaurant.currency,
            price: order.total,
          }}
        />

        {/* the pass: the live status on the night ground, the rest of the order on paper below */}
        <section className="tone-night relative isolate overflow-hidden">
          <span
            aria-hidden
            className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_85%_0%,color-mix(in_srgb,var(--color-brand-accent)_16%,transparent),transparent_55%)]"
          />
          <div className="container-page pt-8 md:pt-10">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[var(--rule)] pb-6">
          <div>
            <p className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-muted-ink)]">
              <CheckCircle2 className="size-4 text-[var(--color-brand-accent)]" aria-hidden />
              {ORDER_TYPE_LABELS[order.orderType]} order, placed{" "}
              {placedAt.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </p>
            <h1 className="tabular mt-3 font-[family-name:var(--font-sans)] text-[1.35rem] font-semibold tracking-[0.04em] md:text-[1.6rem]">
              {order.orderNumber}
            </h1>
            {eta ? <p className="mt-3 text-[15px] font-medium">{eta}</p> : null}
          </div>
          <OrderLiveStatus />
        </header>

        <OrderPass />
        <div className="pb-6">
          <OrderReceivedNotice />
        </div>
          </div>
        </section>

        <div className="container-page mt-10 grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-12">
          <div className="space-y-10">
            <section>
              <h2 className="display-2">Your order</h2>
              <ul className="mt-4 divide-y divide-[var(--rule)] border-y border-[var(--rule)]">
                {(order.items ?? []).map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-4 py-4">
                    <div className="flex min-w-0 gap-3">
                      <span className="tabular grid size-7 shrink-0 place-items-center rounded-full bg-[var(--steel-2)] text-xs font-semibold">
                        {item.quantity}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[15px] font-medium">{item.itemName}</p>
                        {item.variantName || item.addons.length ? (
                          <p className="mt-0.5 text-[13px] text-[var(--color-muted-ink)]">
                            {[
                              item.variantName,
                              ...item.addons.map((addon) => `${addon.addonName}${addon.quantity > 1 ? ` ×${addon.quantity}` : ""}`),
                            ]
                              .filter(Boolean)
                              .join(", ")}
                          </p>
                        ) : null}
                        {item.specialInstructions ? (
                          <p className="mt-1 text-xs italic text-[var(--color-muted-ink)]">&ldquo;{item.specialInstructions}&rdquo;</p>
                        ) : null}
                      </div>
                    </div>
                    <p className="tabular whitespace-nowrap text-[15px] font-medium">{money(item.lineTotal)}</p>
                  </li>
                ))}
              </ul>

              <dl className="tabular mt-4 space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-[var(--color-muted-ink)]">Subtotal</dt>
                  <dd>{money(order.subtotal)}</dd>
                </div>
                {Number(order.discountAmount) > 0 ? (
                  <div className="flex justify-between text-[var(--color-success)]">
                    <dt>Discount{order.couponCode ? ` (${order.couponCode})` : ""}</dt>
                    <dd>-{money(order.discountAmount)}</dd>
                  </div>
                ) : null}
                {Number(order.deliveryFee) > 0 ? (
                  <div className="flex justify-between">
                    <dt className="text-[var(--color-muted-ink)]">Delivery</dt>
                    <dd>{money(order.deliveryFee)}</dd>
                  </div>
                ) : null}
                {Number(order.serviceFee) > 0 ? (
                  <div className="flex justify-between">
                    <dt className="text-[var(--color-muted-ink)]">Service fee</dt>
                    <dd>{money(order.serviceFee)}</dd>
                  </div>
                ) : null}
                {Number(order.taxAmount) > 0 ? (
                  <div className="flex justify-between">
                    <dt className="text-[var(--color-muted-ink)]">Tax</dt>
                    <dd>{money(order.taxAmount)}</dd>
                  </div>
                ) : null}
                {Number(order.tipAmount) > 0 ? (
                  <div className="flex justify-between">
                    <dt className="text-[var(--color-muted-ink)]">Tip</dt>
                    <dd>{money(order.tipAmount)}</dd>
                  </div>
                ) : null}
                <div className="flex items-baseline justify-between border-t border-dashed border-[var(--rule-strong)] pt-3 text-lg font-semibold">
                  <dt>Total</dt>
                  <dd>{money(order.total)}</dd>
                </div>
              </dl>
            </section>

            <section>
              <h2 className="display-2">Timeline</h2>
              <div className="mt-5">
                <LiveOrderTimeline />
              </div>
            </section>
          </div>

          <aside className="space-y-8 lg:sticky lg:top-[calc(var(--header-h,4.5rem)+1.5rem)] lg:self-start">
            <section className="rounded-[var(--radius-panel)] bg-[var(--steel-1)] p-6">
              <h2 className="font-[family-name:var(--font-sans)] text-sm font-semibold">
                {order.orderType === "delivery" ? "Delivering to" : order.orderType === "pickup" ? "Pickup from" : "Dine-in"}
              </h2>
              <div className="mt-3 space-y-2.5 text-sm text-[var(--color-muted-ink)]">
                {order.orderType === "delivery" && order.deliveryAddress ? (
                  <p className="flex items-start gap-2">
                    <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>
                      {[order.deliveryAddress.line1, order.deliveryAddress.line2, order.deliveryAddress.area, order.deliveryAddress.city]
                        .filter(Boolean)
                        .join(", ")}
                    </span>
                  </p>
                ) : null}
                {order.orderType !== "delivery" ? (
                  <p className="flex items-start gap-2">
                    <Store className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span>
                      {order.locationName ?? context.primaryLocation?.name ?? restaurant.name}
                      {order.tableNumber ? `, table ${order.tableNumber}` : ""}
                    </span>
                  </p>
                ) : null}
                <p className="flex items-start gap-2">
                  <Phone className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>{order.customerPhone}</span>
                </p>
                <p className="flex items-start gap-2">
                  <Receipt className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    {PAYMENT_METHOD_LABELS[order.paymentMethod]}, {order.paymentStatus}
                  </span>
                </p>
              </div>
            </section>

            {pushConfig && order.status !== "completed" && order.status !== "cancelled" ? (
              <PushOptIn
                restaurantSlug={restaurant.slug}
                orderNumber={order.orderNumber}
                accessToken={accessToken}
                firebase={pushConfig}
              />
            ) : null}

            {order.status === "completed" || order.status === "cancelled" ? (
              <section className="border-t border-[var(--rule)] pt-5">
                <h2 className="font-[family-name:var(--font-sans)] text-sm font-semibold">Order this again</h2>
                <p className="mt-2 text-sm text-[var(--color-muted-ink)]">
                  Adds these dishes to your tray at today&apos;s prices and availability.
                </p>
                <ReorderButton restaurantSlug={restaurant.slug} orderNumber={order.orderNumber} accessToken={accessToken} />
              </section>
            ) : null}

            {order.status === "completed" && restaurant.features.reviews ? (
              <section className="border-t border-[var(--rule)] pt-5">
                <h2 className="font-[family-name:var(--font-sans)] text-sm font-semibold">How was it?</h2>
                <p className="mt-2 text-sm text-[var(--color-muted-ink)]">A short review helps the next guest decide.</p>
                <Button asChild variant="outline" className="mt-4 w-full">
                  <Link
                    href={`/r/${restaurant.slug}/reviews?order=${encodeURIComponent(order.orderNumber)}${
                      accessToken ? `&t=${encodeURIComponent(accessToken)}` : ""
                    }`}
                  >
                    Write a review
                  </Link>
                </Button>
              </section>
            ) : null}

            <section className="border-t border-[var(--rule)] pt-5 text-sm text-[var(--color-muted-ink)]">
              <p>
                This page always shows the live status of order {order.orderNumber}. Need a hand? Call{" "}
                {restaurant.phone ?? "the restaurant"}.
              </p>
              <Link href={`/r/${restaurant.slug}/orders`} className="mt-3 inline-block font-semibold text-[var(--color-ink)] underline-offset-4 hover:underline">
                My orders
              </Link>
            </section>
          </aside>
        </div>
      </div>
    </OrderLiveProvider>
  );
}
