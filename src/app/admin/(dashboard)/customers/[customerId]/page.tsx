import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getCustomerForAdmin, getCustomerOrderHistory, getCustomerStatsForAdmin } from "@/server/services/customers";
import { ORDER_STATUS_LABELS } from "@/shared/contract/enums";
import { formatMoney } from "@/shared/money";
import { getAdminRestaurant } from "@/web/admin";
import { requirePermission } from "@/web/session";
import { orderStatusBadgeVariant } from "@/components/admin/order-status-badge";

interface CustomerDetailPageProps {
  params: Promise<{ customerId: string }>;
}

export const metadata: Metadata = { title: "Customer" };

export default async function AdminCustomerDetailPage({ params }: CustomerDetailPageProps) {
  const actor = await requirePermission("customers.view");
  const restaurant = await getAdminRestaurant();
  const { customerId } = await params;
  const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };

  const customer = await getCustomerForAdmin(customerId, ctx);
  if (!customer) notFound();

  const [stats, orders] = await Promise.all([
    getCustomerStatsForAdmin(customerId, ctx),
    getCustomerOrderHistory(customerId, ctx, 30),
  ]);

  const money = (value: string) => formatMoney(value, { currency: restaurant.currency });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/customers"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted-ink)] hover:text-[var(--color-ink)]"
        >
          <ArrowLeft className="size-4" aria-hidden /> Back to customers
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">{customer.fullName}</h1>
          {customer.isGuest ? <Badge variant="neutral">Guest</Badge> : null}
          {customer.isBlocked ? <Badge variant="danger">Blocked</Badge> : null}
        </div>
        <p className="mt-1 text-[var(--color-muted-ink)]">
          {customer.phone}
          {customer.email ? ` · ${customer.email}` : ""}
        </p>
      </div>

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
          <p className="p-8 text-center text-sm text-[var(--color-muted-ink)]">No orders yet.</p>
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
                    <Link href={`/admin/orders/${order.orderNumber}`} className="font-medium text-[var(--color-brand)] hover:underline">
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
