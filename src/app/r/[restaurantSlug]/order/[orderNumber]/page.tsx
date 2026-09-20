import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, MapPin, Phone, Receipt, Store } from "lucide-react";
import { ORDER_TYPE_LABELS, PAYMENT_METHOD_LABELS } from "@/shared/contract/enums";
import { getVisitorContext } from "@/web/session";
import { requireStorefront } from "@/web/storefront";
import { trackOrder } from "@/server/services/orders";
import { describeEta, buildOrderTimeline } from "@/shared/order-timeline";
import { formatMoney } from "@/shared/money";
import { Button } from "@/components/ui/button";
import { OrderTimeline } from "@/components/storefront/order-timeline";
import { OrderLiveStatus } from "@/components/storefront/order-live-status";
import { JsonLd } from "@/components/storefront/json-ld";

interface OrderPageProps {
  params: Promise<{ restaurantSlug: string; orderNumber: string }>;
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
export default async function OrderStatusPage({ params }: OrderPageProps) {
  const { restaurantSlug, orderNumber } = await params;

  const context = await requireStorefront(restaurantSlug);

  const visitor = await getVisitorContext(context.restaurant.id);
  const order = await trackOrder(context.restaurant.id, decodeURIComponent(orderNumber), visitor);
  if (!order) {
    return (
      <div className="container-page py-20">
        <div className="mx-auto max-w-lg text-center">
          <h1 className="text-2xl font-semibold">We cannot show this order</h1>
          <p className="mt-3 text-[var(--color-muted-ink)]">
            Orders are visible from the device that placed them. If you ordered from another phone or browser, call{" "}
            {context.restaurant.phone ?? "the restaurant"} with your order number and we will look it up.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild>
              <Link href={`/r/${context.restaurant.slug}/menu`}>Back to the menu</Link>
            </Button>
            {context.restaurant.phone ? (
              <Button asChild variant="outline">
                <a href={`tel:${context.restaurant.phone.replace(/\s+/g, "")}`}>
                  <Phone aria-hidden />
                  Call us
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const { restaurant } = context;
  const money = (value: string) => formatMoney(value, { currency: restaurant.currencySymbol, locale: restaurant.locale });
  const timeline = buildOrderTimeline(order.statusHistory ?? [], { orderType: order.orderType });
  const eta =
    order.status === "completed" || order.status === "cancelled" ? null : describeEta(order.estimatedReadyAt);
  const placedAt = new Date(order.createdAt);

  return (
    <div className="container-page py-10 md:py-14">
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

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="inline-flex items-center gap-2 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="size-4" aria-hidden />
            Order received
          </p>
          <h1 className="mt-2 text-3xl font-semibold md:text-4xl">Order {order.orderNumber}</h1>
          <p className="mt-2 text-sm text-[var(--color-muted-ink)]">
            {ORDER_TYPE_LABELS[order.orderType]} · placed{" "}
            {placedAt.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            {eta ? ` · ${eta}` : ""}
          </p>
        </div>
        <OrderLiveStatus status={order.status} updatedAt={order.updatedAt} />
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1.5fr_1fr] lg:gap-14">
        <div className="space-y-8">
          <section className="rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-6">
            <h2 className="text-lg font-semibold">Progress</h2>
            <div className="mt-5">
              <OrderTimeline steps={timeline} />
            </div>
          </section>

          <section className="rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-6">
            <h2 className="text-lg font-semibold">Your items</h2>
            <ul className="mt-4 divide-y divide-[var(--color-hairline)]">
              {(order.items ?? []).map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-4 py-3">
                  <div>
                    <p className="text-sm font-medium">
                      {item.quantity} × {item.itemName}
                      {item.variantName ? <span className="text-[var(--color-muted-ink)]"> · {item.variantName}</span> : null}
                    </p>
                    {item.addons.length ? (
                      <ul className="mt-1 text-xs text-[var(--color-muted-ink)]">
                        {item.addons.map((addon) => (
                          <li key={addon.id}>
                            + {addon.addonName}
                            {addon.quantity > 1 ? ` ×${addon.quantity}` : ""}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {item.specialInstructions ? (
                      <p className="mt-1 text-xs italic text-[var(--color-muted-ink)]">“{item.specialInstructions}”</p>
                    ) : null}
                  </div>
                  <p className="whitespace-nowrap text-sm font-medium">{money(item.lineTotal)}</p>
                </li>
              ))}
            </ul>

            <dl className="mt-4 space-y-2 border-t border-[var(--color-hairline)] pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-[var(--color-muted-ink)]">Subtotal</dt>
                <dd>{money(order.subtotal)}</dd>
              </div>
              {Number(order.discountAmount) > 0 ? (
                <div className="flex justify-between text-emerald-700">
                  <dt>Discount{order.couponCode ? ` (${order.couponCode})` : ""}</dt>
                  <dd>− {money(order.discountAmount)}</dd>
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
              <div className="flex justify-between border-t border-[var(--color-hairline)] pt-3 text-base font-semibold">
                <dt>Total</dt>
                <dd>{money(order.total)}</dd>
              </div>
            </dl>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-6">
            <h2 className="text-base font-semibold">
              {order.orderType === "delivery" ? "Delivering to" : order.orderType === "pickup" ? "Pickup from" : "Dine-in"}
            </h2>
            <div className="mt-3 space-y-2 text-sm text-[var(--color-muted-ink)]">
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
                    {order.tableNumber ? ` · table ${order.tableNumber}` : ""}
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
                  {PAYMENT_METHOD_LABELS[order.paymentMethod]} · {order.paymentStatus}
                </span>
              </p>
            </div>
          </section>

          {order.status === "completed" && restaurant.features.reviews ? (
            <section className="rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-6">
              <h2 className="text-base font-semibold">How was it?</h2>
              <p className="mt-2 text-sm text-[var(--color-muted-ink)]">
                Leave a review and help the next customer decide.
              </p>
              <Button asChild variant="outline" className="mt-4 w-full">
                <Link href={`/r/${restaurant.slug}/reviews?order=${order.orderNumber}`}>Write a review</Link>
              </Button>
            </section>
          ) : null}

          <section className="rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-6 text-sm text-[var(--color-muted-ink)]">
            <p>
              Keep this page bookmarked — it always shows the live status of order {order.orderNumber}. Need a hand? Call{" "}
              {restaurant.phone ?? "the restaurant"}.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
