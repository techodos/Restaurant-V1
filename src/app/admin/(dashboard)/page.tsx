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
        <h1 className="text-2xl font-semibold">Welcome, {actor.name}</h1>
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
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-[var(--color-muted-ink)]">{restaurant.name} — order overview.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {DASHBOARD_STATUSES.map((status) => (
          <Card key={status}>
            <CardContent className="space-y-1 py-5">
              <p className="text-sm text-[var(--color-muted-ink)]">{ORDER_STATUS_LABELS[status]}</p>
              <p className="text-3xl font-semibold">{counts[status]}</p>
            </CardContent>
          </Card>
        ))}
      </div>

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
