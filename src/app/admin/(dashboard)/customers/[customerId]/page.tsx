import type { Metadata } from "next";
import { adminPath } from "@/shared/utils";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Banknote, CalendarClock, ChevronRight, ClipboardList, Receipt } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getCustomerForAdmin, getCustomerOrderHistory, getCustomerStatsForAdmin } from "@/server/services/customers";
import { ORDER_STATUS_LABELS } from "@/shared/contract/enums";
import { formatMoney } from "@/shared/money";
import { getAdminBranchScope, getAdminRestaurant } from "@/web/admin";
import { requireAdminPage } from "@/web/session";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { StatTile, StatusPill, orderStatusTone, statusEdge, statusEdgeStyle } from "@/components/admin/admin-ui";
import { instanceRestaurantSlug } from "@/web/instance";

interface CustomerDetailPageProps {
  params: Promise<{ customerId: string }>;
}

export const metadata: Metadata = { title: "Customer" };

export default async function AdminCustomerDetailPage({ params }: CustomerDetailPageProps) {
  const restaurantSlug = instanceRestaurantSlug();
  const { customerId } = await params;
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
        backHref={adminPath("/customers")}
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

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile icon={ClipboardList} label="Orders" value={String(stats.orders)} tone="info" />
        <StatTile icon={Banknote} label="Total spent" value={money(stats.spent)} />
        <StatTile icon={Receipt} label="Avg. order" value={money(stats.averageOrderValue)} tone="neutral" />
        <StatTile
          icon={CalendarClock}
          label="Last order"
          value={stats.lastOrderAt ? new Date(stats.lastOrderAt).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "—"}
          tone="neutral"
        />
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--admin-line,var(--color-hairline))] px-5 py-4">
          <h2 className="text-[15px] font-semibold">Order history</h2>
          <span className="tabular text-[13px] text-[var(--color-muted-ink)]">{orders.length} shown</span>
        </div>
        {orders.length === 0 ? (
          <AdminEmptyState icon={ClipboardList} title="No orders yet." />
        ) : (
          <ul className="divide-y divide-[var(--admin-line,var(--color-hairline))]">
            {orders.map((order) => (
              <li key={order.id}>
                <Link
                  href={`${adminPath()}/orders/${order.orderNumber}`}
                  prefetch={false}
                  style={statusEdgeStyle(orderStatusTone(order.status))}
                  className={`group ${statusEdge} flex items-center gap-4 py-3.5 pl-6 pr-5 transition-colors hover:bg-[color-mix(in_srgb,var(--color-brand)_3.5%,transparent)]`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="tabular block whitespace-nowrap font-semibold group-hover:text-[var(--color-brand)]">{order.orderNumber}</span>
                    <span className="block text-xs text-[var(--color-muted-ink)]">
                      {new Date(order.createdAt).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </span>
                  <StatusPill tone={orderStatusTone(order.status)}>{ORDER_STATUS_LABELS[order.status]}</StatusPill>
                  <span className="tabular w-28 shrink-0 text-right font-semibold">{money(order.total)}</span>
                  <ChevronRight className="hidden size-4 shrink-0 text-[var(--color-muted-ink)] sm:block" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
