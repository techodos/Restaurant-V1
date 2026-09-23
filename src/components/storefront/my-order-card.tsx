import Link from "next/link";
import { MapPin, Store } from "lucide-react";
import { ORDER_TYPE_LABELS } from "@/shared/contract/enums";
import type { Order } from "@/shared/contract/models";
import { formatMoney } from "@/shared/money";
import { OrderLiveProvider, OrderLiveStatus } from "./order-live-status";
import { OrderStatusBadge } from "./order-status-badge";
import { Button } from "@/components/ui/button";

/** What the cards need from the restaurant (formatting only). */
export interface OrderCardRestaurant {
  slug: string;
  name: string;
  currencySymbol: string;
  locale: string;
  timezone: string;
}

function whenPlaced(order: Order, restaurant: OrderCardRestaurant): string {
  const options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" };
  try {
    return new Date(order.createdAt).toLocaleString(restaurant.locale, { ...options, timeZone: restaurant.timezone });
  } catch {
    return new Date(order.createdAt).toLocaleString(undefined, options);
  }
}

function fulfilment(order: Order, restaurant: OrderCardRestaurant) {
  if (order.orderType === "delivery") {
    const address = order.deliveryAddress
      ? [order.deliveryAddress.line1, order.deliveryAddress.line2, order.deliveryAddress.area, order.deliveryAddress.city].filter(Boolean).join(", ")
      : "";
    return { Icon: MapPin, text: address ? `Delivering to ${address}` : "Delivery" };
  }
  const place = order.locationName ?? restaurant.name;
  return {
    Icon: Store,
    text: order.orderType === "pickup" ? `Pickup from ${place}` : `Dine-in at ${place}${order.tableNumber ? ` · table ${order.tableNumber}` : ""}`,
  };
}

const itemCount = (order: Order) => (order.items ?? []).reduce((sum, item) => sum + item.quantity, 0);
const orderHref = (restaurant: OrderCardRestaurant, order: Order) => `/r/${restaurant.slug}/order/${encodeURIComponent(order.orderNumber)}`;
const cardClass = "rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-5 sm:p-6";

/**
 * An order in progress. Reuses the live order provider from the order page: the status badge moves
 * by itself (SSE) and the page re-renders once so the order slides into "Previous orders" when it ends.
 */
export function CurrentOrderCard({ order, restaurant }: { order: Order; restaurant: OrderCardRestaurant }) {
  const money = (value: string) => formatMoney(value, { currency: restaurant.currencySymbol, locale: restaurant.locale });
  const { Icon, text } = fulfilment(order, restaurant);

  return (
    <OrderLiveProvider
      restaurantSlug={restaurant.slug}
      orderNumber={order.orderNumber}
      initial={{
        status: order.status,
        paymentStatus: order.paymentStatus,
        estimatedReadyAt: order.estimatedReadyAt,
        updatedAt: order.updatedAt,
      }}
      history={[]}
      orderType={order.orderType}
    >
      <article className={cardClass} data-testid="current-order" aria-label={`Order ${order.orderNumber}`}>
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Order {order.orderNumber}</h3>
            <p className="mt-1 text-sm text-[var(--color-muted-ink)]">
              {restaurant.name} · {ORDER_TYPE_LABELS[order.orderType]} · {whenPlaced(order, restaurant)}
            </p>
          </div>
          <OrderLiveStatus />
        </header>

        <ul className="mt-4 divide-y divide-[var(--color-hairline)] text-sm">
          {(order.items ?? []).map((item) => (
            <li key={item.id} className="flex justify-between gap-4 py-2">
              <span>
                {item.quantity} × {item.itemName}
                {item.variantName ? <span className="text-[var(--color-muted-ink)]"> · {item.variantName}</span> : null}
              </span>
              <span className="whitespace-nowrap">{money(item.lineTotal)}</span>
            </li>
          ))}
        </ul>

        <p className="mt-3 flex items-start gap-2 text-sm text-[var(--color-muted-ink)]">
          <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{text}</span>
        </p>

        <footer className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-hairline)] pt-4">
          <p className="text-base font-semibold">
            Total <span className="ml-1">{money(order.total)}</span>
          </p>
          <Button asChild>
            <Link href={orderHref(restaurant, order)}>Track order</Link>
          </Button>
        </footer>
      </article>
    </OrderLiveProvider>
  );
}

/** A finished order (completed or cancelled). */
export function PreviousOrderCard({ order, restaurant }: { order: Order; restaurant: OrderCardRestaurant }) {
  const money = (value: string) => formatMoney(value, { currency: restaurant.currencySymbol, locale: restaurant.locale });
  const count = itemCount(order);
  const names = (order.items ?? []).map((item) => item.itemName);
  const preview = names.slice(0, 3).join(", ") + (names.length > 3 ? ` +${names.length - 3} more` : "");

  return (
    <article className={cardClass} data-testid="previous-order" aria-label={`Order ${order.orderNumber}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Order {order.orderNumber}</h3>
          <p className="mt-1 text-sm text-[var(--color-muted-ink)]">
            {restaurant.name} · {whenPlaced(order, restaurant)}
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
      </header>
      <p className="mt-3 text-sm text-[var(--color-muted-ink)]">
        {count} item{count === 1 ? "" : "s"}
        {preview ? ` · ${preview}` : ""}
      </p>
      <footer className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-semibold">{money(order.total)}</p>
        <Button asChild variant="outline" size="sm">
          <Link href={orderHref(restaurant, order)}>View order</Link>
        </Button>
      </footer>
    </article>
  );
}
