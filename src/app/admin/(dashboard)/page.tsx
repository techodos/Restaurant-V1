import Link from "next/link";
import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { hasAnyPermission } from "@/server/auth/permissions";
import { getOrderStatusCounts, getRecentOrdersForAdmin } from "@/server/services/orders";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/shared/contract/enums";
import { formatMoney } from "@/shared/money";
import { requireStaffForAdmin } from "@/web/session";
import { getAdminRestaurant } from "@/web/admin";
import { orderStatusBadgeVariant } from "@/components/admin/order-status-badge";

export const metadata: Metadata = { title: "Dashboard" };

const DASHBOARD_STATUSES: OrderStatus[] = ["pending", "confirmed", "preparing", "ready", "out_for_delivery"];

export default async function AdminDashboardPage() {
  const actor = await requireStaffForAdmin();
  const restaurant = await getAdminRestaurant();

  if (!hasAnyPermission(actor.permissions, ["orders.view"])) {
    return (
      <div>
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">Welcome, {actor.name}</h1>
        <p className="mt-2 text-[var(--color-muted-ink)]">You do not have access to any dashboard widgets yet.</p>
      </div>
    );
  }

  const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
  const [counts, recentOrders] = await Promise.all([
    getOrderStatusCounts(restaurant.id, ctx),
    getRecentOrdersForAdmin(restaurant.id, ctx, 8),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">Dashboard</h1>
        <p className="mt-1 text-[var(--color-muted-ink)]">Live order overview for {restaurant.name}.</p>
      </div>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 lg:gap-4">
        {DASHBOARD_STATUSES.map((status) => {
          // "pending" is the one that needs a person right now: give it the brand panel when orders wait
          const urgent = status === "pending" && counts[status] > 0;
          return (
            <li key={status} className={status === "pending" ? "col-span-2 sm:col-span-1" : undefined}>
              <Link
                href={`/admin/orders?status=${status}`}
                className={
                  urgent
                    ? "flex h-full flex-col justify-between gap-6 rounded-[var(--radius-card)] bg-[var(--color-brand)] p-5 text-[var(--color-brand-foreground)] shadow-[var(--shadow-brand)] transition-transform duration-300 hover:-translate-y-0.5"
                    : "surface-card hover-lift flex h-full flex-col justify-between gap-6 p-5"
                }
              >
                <span className={urgent ? "text-sm font-medium opacity-85" : "text-sm font-medium text-[var(--color-muted-ink)]"}>
                  {ORDER_STATUS_LABELS[status]}
                </span>
                <span className="tabular text-4xl font-semibold leading-none tracking-[-0.03em]">{counts[status]}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <Card>
        <CardHeader className="flex-row items-center justify-between pb-4">
          <CardTitle>Recent orders</CardTitle>
          <Link href="/admin/orders" className="text-sm font-medium text-[var(--color-brand)] hover:underline">
            View all
          </Link>
        </CardHeader>
        <CardContent className="pt-4">
          {recentOrders.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-[var(--color-muted-ink)]">
              <ClipboardList className="size-4" aria-hidden /> No orders yet.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--color-hairline)]">
              {recentOrders.map((order) => (
                <li key={order.id}>
                  <Link
                    href={`/admin/orders/${order.orderNumber}`}
                    className="flex items-center justify-between gap-3 py-3 hover:bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)]"
                  >
                    <div>
                      <p className="font-medium">{order.orderNumber}</p>
                      <p className="text-sm text-[var(--color-muted-ink)]">{order.customerName}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">
                        {formatMoney(order.total, { currency: restaurant.currency })}
                      </span>
                      <Badge variant={orderStatusBadgeVariant(order.status)}>{ORDER_STATUS_LABELS[order.status]}</Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
