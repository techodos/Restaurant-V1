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
const cardClass = "surface-card p-6 shadow-[var(--shadow-card)] md:p-7";

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
            <p className="eyebrow mb-2">{ORDER_TYPE_LABELS[order.orderType]}</p>
            <h3 className="display-3 tabular">Order {order.orderNumber}</h3>
            <p className="mt-1 text-sm text-[var(--color-muted-ink)]">
              {restaurant.name} · {whenPlaced(order, restaurant)}
            </p>
          </div>
          <OrderLiveStatus />
        </header>

        <ul className="mt-5 divide-y divide-[var(--rule)] border-y border-[var(--rule)] text-sm">
          {(order.items ?? []).map((item) => (
            <li key={item.id} className="flex justify-between gap-4 py-2">
              <span>
                {item.quantity} × {item.itemName}
                {item.variantName ? <span className="text-[var(--color-muted-ink)]"> · {item.variantName}</span> : null}
              </span>
              <span className="tabular whitespace-nowrap">{money(item.lineTotal)}</span>
            </li>
          ))}
        </ul>

        <p className="mt-3 flex items-start gap-2 text-sm text-[var(--color-muted-ink)]">
          <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{text}</span>
        </p>

        <footer className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="tabular">
            <span className="block text-[12px] text-[var(--color-muted-ink)]">Total</span>
            <span className="text-lg font-semibold">{money(order.total)}</span>
          </p>
          <Button asChild>
            <Link href={orderHref(restaurant, order)}>Track order</Link>
          </Button>
        </footer>
      </article>
    </OrderLiveProvider>
  );
}

/** A finished order (completed or cancelled): one ledger row, led by the date it was placed. */
export function PreviousOrderCard({ order, restaurant }: { order: Order; restaurant: OrderCardRestaurant }) {
  const money = (value: string) => formatMoney(value, { currency: restaurant.currencySymbol, locale: restaurant.locale });
  const count = itemCount(order);
  const names = (order.items ?? []).map((item) => item.itemName);
  const preview = names.slice(0, 3).join(", ") + (names.length > 3 ? ` +${names.length - 3} more` : "");
  const date = (options: Intl.DateTimeFormatOptions) => {
    try {
      return new Date(order.createdAt).toLocaleDateString(restaurant.locale, { ...options, timeZone: restaurant.timezone });
    } catch {
      return new Date(order.createdAt).toLocaleDateString(undefined, options);
    }
  };

  return (
    <article
      className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-5 gap-y-4 border-t border-[var(--rule)] py-6 md:grid-cols-[5rem_minmax(0,1fr)_auto] md:items-center md:gap-x-8"
      data-testid="previous-order"
      aria-label={`Order ${order.orderNumber}`}
    >
      <p className="row-span-2 text-center md:row-span-1" title={whenPlaced(order, restaurant)}>
        <span className="tabular block font-[family-name:var(--font-display)] text-[2.2rem] leading-none md:text-[2.8rem]">{date({ day: "numeric" })}</span>
        <span className="mt-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted-ink)]">
          {date({ month: "short", year: "2-digit" })}
        </span>
      </p>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <h3 className="tabular text-[15px] font-semibold">Order {order.orderNumber}</h3>
          <OrderStatusBadge status={order.status} />
        </div>
        <p className="mt-1.5 truncate text-sm text-[var(--color-muted-ink)]">
          {ORDER_TYPE_LABELS[order.orderType]} · {count} item{count === 1 ? "" : "s"}
          {preview ? ` · ${preview}` : ""}
        </p>
      </div>
      <footer className="flex items-center justify-between gap-5 md:justify-end">
        <p className="tabular text-[15px] font-semibold">{money(order.total)}</p>
        <Button asChild variant="outline" size="sm">
          <Link href={orderHref(restaurant, order)}>View order</Link>
        </Button>
      </footer>
    </article>
  );
}
