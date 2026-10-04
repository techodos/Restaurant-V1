import type { Metadata } from "next";
import { adminPath } from "@/shared/utils";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getCustomerForAdmin, getCustomerOrderHistory, getCustomerStatsForAdmin } from "@/server/services/customers";
import { ORDER_STATUS_LABELS } from "@/shared/contract/enums";
import { formatMoney } from "@/shared/money";
import { getAdminRestaurant } from "@/web/admin";
import { requirePermission } from "@/web/session";
import { orderStatusBadgeVariant } from "@/components/admin/order-status-badge";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";

interface CustomerDetailPageProps {
  params: Promise<{ restaurantSlug: string; customerId: string }>;
}

export const metadata: Metadata = { title: "Customer" };

export default async function AdminCustomerDetailPage({ params }: CustomerDetailPageProps) {
  const { restaurantSlug, customerId } = await params;
  const actor = await requirePermission("customers.view", restaurantSlug);
  const restaurant = await getAdminRestaurant(restaurantSlug);
  const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };

  // all three side by side (they were customer first, then the other two): nothing is shown unless
  // the customer is found, and every read is scoped to this restaurant by RLS/ctx as before
  const [customer, stats, orders] = await Promise.all([
    getCustomerForAdmin(customerId, ctx),
    getCustomerStatsForAdmin(customerId, ctx),
    getCustomerOrderHistory(customerId, ctx, 30),
  ]);
  if (!customer) notFound();

  const money = (value: string) => formatMoney(value, { currency: restaurant.currency });

  return (
    <div className="space-y-6">
      <AdminPageHeader
        backHref={adminPath(restaurantSlug, "/customers")}
        backLabel="Back to customers"
        title={customer.fullName}
        badge={
          <>
            {customer.isGuest ? <Badge variant="neutral">Guest</Badge> : null}
            {customer.isBlocked ? <Badge variant="danger">Blocked</Badge> : null}
          </>
        }
        description={`${customer.phone}${customer.email ? ` · ${customer.email}` : ""}`}
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="py-5">
            <p className="text-sm text-[var(--color-muted-ink)]">Orders</p>
            <p className="text-2xl font-semibold">{stats.orders}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-5">
            <p className="text-sm text-[var(--color-muted-ink)]">Total spent</p>
            <p className="text-2xl font-semibold">{money(stats.spent)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-5">
            <p className="text-sm text-[var(--color-muted-ink)]">Avg. order</p>
            <p className="text-2xl font-semibold">{money(stats.averageOrderValue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-5">
            <p className="text-sm text-[var(--color-muted-ink)]">Last order</p>
            <p className="text-lg font-semibold">
              {stats.lastOrderAt
                ? new Date(stats.lastOrderAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })
                : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="overflow-hidden">
        {orders.length === 0 ? (
          <AdminEmptyState icon={ClipboardList} title="No orders yet." />
        ) : (
          <div className="overflow-x-auto"><table className="tabular w-full min-w-[42rem] text-sm">
            <thead className="border-b border-[var(--color-hairline)] bg-[color-mix(in_srgb,var(--color-ink)_3%,transparent)] text-left text-xs font-medium text-[var(--color-muted-ink)]">
              <tr>
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Placed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-hairline)]">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-[color-mix(in_srgb,var(--color-ink)_3%,transparent)]">
                  <td className="px-4 py-3">
                    <Link href={`${adminPath(restaurantSlug)}/orders/${order.orderNumber}`} className="font-medium text-[var(--color-brand)] hover:underline">
                      {order.orderNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-medium">{money(order.total)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={orderStatusBadgeVariant(order.status)}>{ORDER_STATUS_LABELS[order.status]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-muted-ink)]">
                    {new Date(order.createdAt).toLocaleString(undefined, {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}
