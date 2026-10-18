import type { Metadata } from "next";
import { Bike, CalendarClock, ChefHat, Clock, MessageSquareText, ShoppingBag, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getKitchenOrders } from "@/server/services/orders";
import { ORDER_STATUS_LABELS, ORDER_TYPE_LABELS, type OrderStatus, type OrderType } from "@/shared/contract/enums";
import type { Order } from "@/shared/contract/models";
import { requireAdminPage } from "@/web/session";
import { getAdminBranchScope, getAdminRestaurant } from "@/web/admin";
import { KitchenAutoRefresh } from "@/components/admin/kitchen-auto-refresh";
import { OrderStatusControl } from "@/components/admin/order-status-control";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { StatusPill, orderStatusTone } from "@/components/admin/admin-ui";
import { instanceRestaurantSlug } from "@/web/instance";
import { cn } from "@/shared/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Kitchen" };

/** A ticket this old (minutes since it was placed) is flagged late; half of it is "getting on". */
const LATE_AFTER_MINUTES = 20;
const WARN_AFTER_MINUTES = 10;

type Urgency = "fresh" | "warn" | "late";

/** The board's three lanes, in the order a ticket moves through them. */
const LANES: { key: string; title: string; hint: string; statuses: OrderStatus[]; dot: string }[] = [
  { key: "new", title: "New", hint: "Confirm and start", statuses: ["pending", "confirmed"], dot: "bg-[var(--color-warning)]" },
  { key: "cooking", title: "Preparing", hint: "On the line", statuses: ["preparing"], dot: "bg-[var(--color-info)]" },
  { key: "ready", title: "Ready", hint: "Hand over or dispatch", statuses: ["ready", "out_for_delivery"], dot: "bg-[var(--color-success)]" },
];

const TYPE_ICONS: Record<OrderType, LucideIcon> = { delivery: Bike, pickup: ShoppingBag, dine_in: UtensilsCrossed };

function elapsedMinutes(createdAt: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
}

function urgencyOf(minutes: number): Urgency {
  if (minutes >= LATE_AFTER_MINUTES) return "late";
  return minutes >= WARN_AFTER_MINUTES ? "warn" : "fresh";
}

function formatElapsed(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

const URGENCY_STYLES: Record<Urgency, { timer: string; card: string; bar: string }> = {
  fresh: {
    timer: "text-[color-mix(in_srgb,var(--color-success)_80%,var(--color-ink))] bg-[color-mix(in_srgb,var(--color-success)_10%,var(--color-surface))]",
    card: "",
    bar: "bg-[var(--color-success)]",
  },
  warn: {
    timer: "text-[color-mix(in_srgb,var(--color-warning)_80%,var(--color-ink))] bg-[color-mix(in_srgb,var(--color-warning)_13%,var(--color-surface))]",
    card: "",
    bar: "bg-[var(--color-warning)]",
  },
  late: {
    timer: "text-white bg-[var(--color-danger)]",
    card: "ring-1 ring-[color-mix(in_srgb,var(--color-danger)_45%,transparent)]",
    bar: "bg-[var(--color-danger)]",
  },
};

export default async function AdminKitchenPage() {
  const restaurantSlug = instanceRestaurantSlug();
  const actor = await requireAdminPage("kitchen.view", restaurantSlug);
  const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };

  // the staff check already tied this session to this slug's restaurant; no need to wait for its row.
  // Tickets of the branch in scope only (header selector / the member's own branch).
  const { locationId } = await getAdminBranchScope(restaurantSlug);
  const [orders, restaurant] = await Promise.all([getKitchenOrders(actor.restaurantId, ctx, locationId), getAdminRestaurant(restaurantSlug)]);
  const timeFormat = new Intl.DateTimeFormat("en-PK", { hour: "numeric", minute: "2-digit", timeZone: restaurant.timezone });

  // oldest first in every lane: the ticket that has waited longest is the next one to cook
  const sorted = [...orders].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const lanes = LANES.map((lane) => ({ ...lane, orders: sorted.filter((order) => lane.statuses.includes(order.status)) }));
  const lateCount = orders.filter((order) => elapsedMinutes(order.createdAt) >= LATE_AFTER_MINUTES).length;

  return (
    <div className="space-y-6">
      <KitchenAutoRefresh />
      <AdminPageHeader
        title="Kitchen"
        description={
          <span className="inline-flex items-center gap-2">
            <span className="relative flex size-2" aria-hidden>
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--color-success)] opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex size-2 rounded-full bg-[var(--color-success)]" />
            </span>
            Live · {orders.length} active {orders.length === 1 ? "order" : "orders"} · refreshes every 20 seconds
          </span>
        }
      />

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {lanes.map((lane) => (
          <div key={lane.key} className="rounded-[var(--radius-card,14px)] border border-[var(--color-hairline)] bg-[var(--color-surface)] px-4 py-3">
            <dt className="flex items-center gap-2 text-[13px] font-medium text-[var(--color-muted-ink)]">
              <span aria-hidden className={cn("size-2 rounded-full", lane.dot)} />
              {lane.title}
            </dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{lane.orders.length}</dd>
          </div>
        ))}
        <div
          className={cn(
            "rounded-[var(--radius-card,14px)] border px-4 py-3",
            lateCount
              ? "border-[color-mix(in_srgb,var(--color-danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--color-danger)_7%,var(--color-surface))]"
              : "border-[var(--color-hairline)] bg-[var(--color-surface)]",
          )}
        >
          <dt className="flex items-center gap-2 text-[13px] font-medium text-[var(--color-muted-ink)]">
            <Clock className="size-3.5" aria-hidden />
            Late ({LATE_AFTER_MINUTES}m+)
          </dt>
          <dd className={cn("mt-1 text-2xl font-semibold tabular-nums", lateCount && "text-[var(--color-danger)]")}>{lateCount}</dd>
        </div>
      </dl>

      {orders.length === 0 ? (
        <Card>
          <AdminEmptyState icon={ChefHat} title="No active orders right now. New orders appear here automatically." className="py-16" />
        </Card>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-3">
          {lanes.map((lane) => (
            <section key={lane.key} aria-labelledby={`lane-${lane.key}`} className="rounded-[calc(var(--radius-card,14px)+4px)] bg-[var(--color-canvas-muted)] p-3">
              <header className="mb-3 flex items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2">
                  <span aria-hidden className={cn("size-2.5 rounded-full", lane.dot)} />
                  <h2 id={`lane-${lane.key}`} className="text-[15px] font-semibold">
                    {lane.title}
                  </h2>
                  <span className="rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-xs font-semibold tabular-nums text-[var(--color-muted-ink)]">
                    {lane.orders.length}
                  </span>
                </div>
                <span className="text-xs text-[var(--color-muted-ink)]">{lane.hint}</span>
              </header>
              {lane.orders.length === 0 ? (
                <p className="rounded-[var(--radius-card,14px)] border border-dashed border-[var(--color-hairline)] px-4 py-8 text-center text-sm text-[var(--color-muted-ink)]">
                  Nothing here
                </p>
              ) : (
                <ul className="space-y-3">
                  {lane.orders.map((order) => (
                    <li key={order.id}>
                      <KitchenTicket order={order} formatTime={(value) => timeFormat.format(new Date(value))} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function KitchenTicket({ order, formatTime }: { order: Order; formatTime: (value: string) => string }) {
  const minutes = elapsedMinutes(order.createdAt);
  const urgency = urgencyOf(minutes);
  const styles = URGENCY_STYLES[urgency];
  const TypeIcon = TYPE_ICONS[order.orderType];
  const itemCount = (order.items ?? []).reduce((sum, item) => sum + item.quantity, 0);

  return (
    <article
      aria-label={`Order ${order.orderNumber}`}
      className={cn(
        "relative overflow-hidden rounded-[var(--radius-card,14px)] border border-[var(--color-hairline)] bg-[var(--color-surface)] shadow-[0_1px_2px_rgba(16,24,40,0.04)]",
        styles.card,
      )}
    >
      <span aria-hidden className={cn("absolute inset-x-0 top-0 h-1", styles.bar)} />
      <div className="space-y-3.5 p-4 pt-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-mono text-[17px] font-semibold tracking-tight">{order.orderNumber}</h3>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[var(--color-muted-ink)]">
              <span className="inline-flex items-center gap-1 font-medium text-[var(--color-ink)]">
                <TypeIcon className="size-3.5" aria-hidden />
                {ORDER_TYPE_LABELS[order.orderType]}
                {order.tableNumber ? ` · Table ${order.tableNumber}` : ""}
              </span>
              <span aria-hidden>·</span>
              <span className="truncate">{order.customerName}</span>
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <span
              className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-semibold tabular-nums", styles.timer)}
              title={`Placed ${formatTime(order.createdAt)}`}
            >
              <Clock className="size-3.5" aria-hidden />
              {formatElapsed(minutes)}
              {urgency === "late" ? <span className="sr-only"> (late)</span> : null}
            </span>
            <StatusPill tone={orderStatusTone(order.status)}>{ORDER_STATUS_LABELS[order.status]}</StatusPill>
          </div>
        </div>

        {order.scheduledFor ? (
          <p className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--color-info)_10%,var(--color-surface))] px-2.5 py-1 text-xs font-semibold text-[color-mix(in_srgb,var(--color-info)_85%,var(--color-ink))]">
            <CalendarClock className="size-3.5" aria-hidden />
            Scheduled for {formatTime(order.scheduledFor)}
          </p>
        ) : null}

        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-muted-ink)]">
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </p>
          <ul className="space-y-2.5">
            {(order.items ?? []).map((item) => (
              <li key={item.id} className="flex gap-3">
                <span className="grid h-7 min-w-7 shrink-0 place-items-center rounded-lg bg-[color-mix(in_srgb,var(--color-brand)_10%,var(--color-surface))] px-1.5 text-sm font-bold tabular-nums text-[var(--color-brand)]">
                  {item.quantity}
                </span>
                <div className="min-w-0 pt-0.5">
                  <p className="text-[15px] font-medium leading-snug">
                    {item.itemName}
                    {item.variantName ? <span className="font-normal text-[var(--color-muted-ink)]"> · {item.variantName}</span> : null}
                  </p>
                  {item.addons.length ? (
                    <ul className="mt-0.5 text-[13px] text-[var(--color-muted-ink)]">
                      {item.addons.map((addon) => (
                        <li key={addon.id}>
                          + {addon.addonName}
                          {addon.quantity > 1 ? ` ×${addon.quantity}` : ""}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {item.specialInstructions ? (
                    <p className="mt-1 text-[13px] font-medium text-[color-mix(in_srgb,var(--color-warning)_75%,var(--color-ink))]">
                      “{item.specialInstructions}”
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {order.specialInstructions ? (
          <div className="flex gap-2 rounded-xl bg-[color-mix(in_srgb,var(--color-warning)_12%,var(--color-surface))] p-3 text-[13px] text-[color-mix(in_srgb,var(--color-warning)_70%,var(--color-ink))]">
            <MessageSquareText className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              <span className="font-semibold">Note: </span>
              {order.specialInstructions}
            </p>
          </div>
        ) : null}

        <div className="border-t border-[var(--color-hairline)] pt-3.5">
          <OrderStatusControl orderId={order.id} orderNumber={order.orderNumber} currentStatus={order.status} orderType={order.orderType} layout="ticket" />
        </div>
      </div>
    </article>
  );
}
