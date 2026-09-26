import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, CalendarCheck, ChefHat, ClipboardList, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { hasAnyPermission } from "@/server/auth/permissions";
import { getOrderStatusCounts, getRecentOrdersForAdmin } from "@/server/services/orders";
import { listReservationsForStaff } from "@/server/services/reservations";
import { listReviewsForAdmin } from "@/server/services/reviews";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/shared/contract/enums";
import { formatMoney } from "@/shared/money";
import { formatDateKey } from "@/shared/hours";
import { cn } from "@/shared/utils";
import { requireStaffForAdmin } from "@/web/session";
import { getAdminRestaurant } from "@/web/admin";
import { orderStatusBadgeVariant } from "@/components/admin/order-status-badge";
import { RatingStars } from "@/components/storefront/rating-stars";

export const metadata: Metadata = { title: "Dashboard" };

const DASHBOARD_STATUSES: OrderStatus[] = ["pending", "confirmed", "preparing", "ready", "out_for_delivery"];

function Panel({
  title,
  href,
  linkLabel,
  icon: Icon,
  count,
  children,
}: {
  title: string;
  href: string;
  linkLabel: string;
  icon: typeof ClipboardList;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="surface-card overflow-hidden">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--color-hairline)] px-5 py-4">
        <h2 className="flex items-center gap-2.5 text-[15px] font-semibold">
          <Icon className="size-4 text-[var(--color-muted-ink)]" aria-hidden />
          {title}
          {count !== undefined ? (
            <span className="tabular rounded-full bg-[var(--tint-strong)] px-2 py-0.5 text-[12px] font-semibold">{count}</span>
          ) : null}
        </h2>
        <Link href={href} className="link-arrow text-[13px] text-[var(--color-muted-ink)]">
          {linkLabel}
          <ArrowRight aria-hidden />
        </Link>
      </header>
      {children}
    </section>
  );
}

/**
 * Service dashboard. Everything on it is live data the staff member may see: the pass (orders by status),
 * the latest orders, the next reservations and the review queue. Each block is gated by the same
 * permission as its own screen; nothing is estimated or invented.
 */
export default async function AdminDashboardPage() {
  const actor = await requireStaffForAdmin();
  const restaurant = await getAdminRestaurant();
  const canOrders = hasAnyPermission(actor.permissions, ["orders.view"]);
  const canReservations = hasAnyPermission(actor.permissions, ["reservations.view"]);
  const canReviews = hasAnyPermission(actor.permissions, ["reviews.view"]);

  if (!canOrders && !canReservations && !canReviews) {
    return (
      <div>
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">Welcome, {actor.name}</h1>
        <p className="mt-2 text-[var(--color-muted-ink)]">You do not have access to any dashboard widgets yet.</p>
      </div>
    );
  }

  const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
  const [counts, recentOrders, reservations, reviews] = await Promise.all([
    canOrders ? getOrderStatusCounts(restaurant.id, ctx) : null,
    canOrders ? getRecentOrdersForAdmin(restaurant.id, ctx, 8) : [],
    canReservations ? listReservationsForStaff(restaurant.id, { status: "upcoming", page: 1, pageSize: 5 }, ctx) : null,
    canReviews ? listReviewsForAdmin(restaurant.id, { status: "pending", page: 1, pageSize: 3 }, ctx) : null,
  ]);

  const waiting = counts?.pending ?? 0;
  const inService = counts ? DASHBOARD_STATUSES.reduce((total, status) => total + counts[status], 0) : 0;
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="space-y-8">
      {/* the pass: live service at a glance on the night ground */}
      <section className="tone-night relative isolate overflow-hidden rounded-[var(--radius-panel)] p-6 md:p-8">
        <span
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_100%_0%,color-mix(in_srgb,var(--color-brand-accent)_16%,transparent),transparent_55%)]"
        />
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted-ink)]">{today}</p>
            <h1 className="mt-2 font-[family-name:var(--font-heading)] text-[2.2rem] leading-none md:text-[2.8rem]">Service</h1>
            {counts ? (
              <p className="tabular mt-3 text-[15px] text-[var(--color-muted-ink)]">
                {inService} order{inService === 1 ? "" : "s"} on the pass at {restaurant.name}
                {waiting > 0 ? `, ${waiting} waiting for confirmation` : ""}.
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {hasAnyPermission(actor.permissions, ["kitchen.view"]) ? (
              <Link
                href="/admin/kitchen"
                className="press inline-flex h-10 items-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-brand-accent)] px-4 text-sm font-semibold text-[var(--color-brand-accent-foreground)]"
              >
                <ChefHat className="size-4" aria-hidden />
                Open kitchen view
              </Link>
            ) : null}
            {canOrders ? (
              <Link
                href="/admin/orders"
                className="press inline-flex h-10 items-center rounded-[var(--radius-control)] border border-[var(--rule-strong)] px-4 text-sm font-semibold hover:bg-[var(--tint)]"
              >
                All orders
              </Link>
            ) : null}
          </div>
        </div>

        {counts ? (
          <nav aria-label="Orders by status" className="scrollbar-none -mx-6 mt-8 overflow-x-auto px-6 md:mx-0 md:px-0">
            <ol className="grid min-w-[36rem] grid-cols-5 gap-2">
              {DASHBOARD_STATUSES.map((status) => {
                const urgent = status === "pending" && counts[status] > 0;
                return (
                  <li key={status}>
                    <Link
                      href={`/admin/orders?status=${status}`}
                      className={cn(
                        "press flex h-full flex-col justify-between gap-6 rounded-[var(--radius-card)] border p-4 transition-colors",
                        urgent
                          ? "border-transparent bg-[var(--color-brand-accent)] text-[var(--color-brand-accent-foreground)]"
                          : "border-[var(--rule)] hover:bg-[var(--tint)]",
                      )}
                    >
                      <span className={cn("text-[13px] font-medium", urgent ? "opacity-85" : "text-[var(--color-muted-ink)]")}>
                        {ORDER_STATUS_LABELS[status]}
                      </span>
                      <span className="tabular text-[2.4rem] font-semibold leading-none tracking-[-0.03em]">{counts[status]}</span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </nav>
        ) : null}
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        {canOrders ? (
          <Panel title="Latest orders" href="/admin/orders" linkLabel="View all" icon={ClipboardList}>
            {recentOrders.length === 0 ? (
              <p className="flex items-center gap-2 px-5 py-10 text-sm text-[var(--color-muted-ink)]">
                <ClipboardList className="size-4" aria-hidden /> No orders yet. New orders appear here the moment they are placed.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--color-hairline)]">
                {recentOrders.map((order) => (
                  <li key={order.id}>
                    <Link
                      href={`/admin/orders/${order.orderNumber}`}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-5 py-3.5 transition-colors hover:bg-[var(--tint)] sm:grid-cols-[10rem_minmax(0,1fr)_auto_8rem]"
                    >
                      <span className="tabular font-medium">{order.orderNumber}</span>
                      <span className="order-3 truncate text-sm text-[var(--color-muted-ink)] sm:order-none">{order.customerName}</span>
                      <span className="tabular text-sm font-medium sm:text-right">{formatMoney(order.total, { currency: restaurant.currency })}</span>
                      <span className="order-4 justify-self-end sm:order-none">
                        <Badge variant={orderStatusBadgeVariant(order.status)}>{ORDER_STATUS_LABELS[order.status]}</Badge>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        ) : null}

        <div className="space-y-6">
          {reservations ? (
            <Panel title="Upcoming reservations" href="/admin/reservations" linkLabel="All" icon={CalendarCheck} count={reservations.total}>
              {reservations.rows.length === 0 ? (
                <p className="px-5 py-8 text-sm text-[var(--color-muted-ink)]">No upcoming bookings.</p>
              ) : (
                <ul className="divide-y divide-[var(--color-hairline)]">
                  {reservations.rows.map((reservation) => (
                    <li key={reservation.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 px-5 py-3">
                      <span className="tabular leading-tight">
                        <span className="block text-[15px] font-semibold">{reservation.reservationTime.slice(0, 5)}</span>
                        <span className="block text-[12px] text-[var(--color-muted-ink)]">
                          {formatDateKey(reservation.reservationDate, undefined, { weekday: "short", day: "numeric", month: "short" })}
                        </span>
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{reservation.guestName}</span>
                        <span className="block truncate text-[12.5px] text-[var(--color-muted-ink)]">
                          {reservation.guests} guest{reservation.guests === 1 ? "" : "s"}
                          {reservation.locationName ? ` · ${reservation.locationName}` : ""}
                        </span>
                      </span>
                      <Badge
                        className="capitalize"
                        variant={reservation.status === "pending" ? "warning" : reservation.status === "confirmed" ? "info" : "soft"}
                      >
                        {reservation.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : null}

          {reviews ? (
            <Panel title="Reviews to moderate" href="/admin/reviews" linkLabel="Queue" icon={Star} count={reviews.total}>
              {reviews.rows.length === 0 ? (
                <p className="px-5 py-8 text-sm text-[var(--color-muted-ink)]">Nothing waiting. New reviews land here first.</p>
              ) : (
                <ul className="divide-y divide-[var(--color-hairline)]">
                  {reviews.rows.map((review) => (
                    <li key={review.id} className="px-5 py-3.5">
                      <div className="flex items-center justify-between gap-3">
                        <span className="truncate text-sm font-medium">{review.authorName}</span>
                        <RatingStars rating={review.rating} />
                      </div>
                      {review.comment ? (
                        <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-[var(--color-muted-ink)]">{review.comment}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          ) : null}
        </div>
      </div>
    </div>
  );
}
