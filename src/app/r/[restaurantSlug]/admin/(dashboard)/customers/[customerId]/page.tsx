import type { Metadata } from "next";
import { adminPath } from "@/shared/utils";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getCustomerForAdmin, getCustomerOrderHistory, getCustomerStatsForAdmin } from "@/server/services/customers";
import { ORDER_STATUS_LABELS } from "@/shared/contract/enums";
import { formatMoney } from "@/shared/money";
import { getAdminBranchScope, getAdminRestaurant } from "@/web/admin";
import { requireAdminPage } from "@/web/session";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { StatusPill, orderStatusTone, tableHead } from "@/components/admin/admin-ui";

interface CustomerDetailPageProps {
  params: Promise<{ restaurantSlug: string; customerId: string }>;
}

export const metadata: Metadata = { title: "Customer" };

export default async function AdminCustomerDetailPage({ params }: CustomerDetailPageProps) {
  const { restaurantSlug, customerId } = await params;
  const actor = await requireAdminPage("customers.view", restaurantSlug);
  const [restaurant, { locationId }] = await Promise.all([getAdminRestaurant(restaurantSlug), getAdminBranchScope(restaurantSlug)]);
  const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };

  // all three side by side (they were customer first, then the other two): nothing is shown unless
  // the customer is found, and every read is scoped to this restaurant by RLS/ctx as before
  const [customer, stats, orders] = await Promise.all([
    getCustomerForAdmin(customerId, ctx),
    // stats and history of the branch in scope only (a manager never sees another branch's orders here)
    getCustomerStatsForAdmin(customerId, ctx, locationId),
    getCustomerOrderHistory(customerId, ctx, 30, locationId),
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
            {customer.isGuest ? <StatusPill tone="neutral">Guest</StatusPill> : null}
            {customer.isBlocked ? <StatusPill tone="danger">Blocked</StatusPill> : null}
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
            <thead className={tableHead}>
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
                    <StatusPill tone={orderStatusTone(order.status)}>{ORDER_STATUS_LABELS[order.status]}</StatusPill>
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
