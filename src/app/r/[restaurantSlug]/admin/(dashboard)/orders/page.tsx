import type { Metadata } from "next";
import { adminPath } from "@/shared/utils";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getOrderStatusCounts, listOrdersForStaff } from "@/server/services/orders";
import { ORDER_STATUS_LABELS, ORDER_TYPE_LABELS, type OrderStatus } from "@/shared/contract/enums";
import { formatMoney } from "@/shared/money";
import { getAdminRestaurant } from "@/web/admin";
import { requirePermission } from "@/web/session";
import { orderStatusBadgeVariant } from "@/components/admin/order-status-badge";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatusTabs } from "@/components/admin/admin-status-tabs";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminPagination } from "@/components/admin/admin-pagination";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Orders" };

const TABS: { key: "active" | "all" | OrderStatus; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "pending", label: "Pending" },
  { key: "confirmed", label: "Confirmed" },
  { key: "preparing", label: "Preparing" },
  { key: "ready", label: "Ready" },
  { key: "out_for_delivery", label: "Out for delivery" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All" },
];

interface OrdersPageProps {
  params: Promise<{ restaurantSlug: string }>;
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}

export default async function AdminOrdersPage({ params, searchParams }: OrdersPageProps) {
  const { restaurantSlug } = await params;
  const actor = await requirePermission("orders.view", restaurantSlug);
  const restaurant = await getAdminRestaurant(restaurantSlug);
  const { status, q, page } = await searchParams;
  const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };

  const activeStatus = (status ?? "active") as "active" | "all" | OrderStatus;
  const pageNum = Number.parseInt(page ?? "1", 10) || 1;

  const [counts, result] = await Promise.all([
    getOrderStatusCounts(restaurant.id, ctx),
    listOrdersForStaff(restaurant.id, { status: activeStatus, search: q, page: pageNum, pageSize: 20 }, ctx),
  ]);

  const countFor = (key: string): number => {
    if (key === "all") return Object.values(counts).reduce((sum, n) => sum + n, 0);
    if (key === "active") return counts.pending + counts.confirmed + counts.preparing + counts.ready + counts.out_for_delivery;
    return counts[key as OrderStatus] ?? 0;
  };

  const linkFor = (params: { status?: string; page?: number }) => {
    const search = new URLSearchParams();
    search.set("status", params.status ?? activeStatus);
    if (q) search.set("q", q);
    if (params.page && params.page > 1) search.set("page", String(params.page));
    return `${adminPath(restaurantSlug)}/orders?${search.toString()}`;
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Orders" description={`${result.total} total`} />

      <AdminStatusTabs
        options={TABS.map((tab) => ({ key: tab.key, label: tab.label, count: countFor(tab.key) }))}
        active={activeStatus}
        linkFor={(key) => linkFor({ status: key })}
      />

      <form action={adminPath(restaurantSlug, "/orders")} className="flex max-w-md gap-2">
        <input type="hidden" name="status" value={activeStatus} />
        <Input name="q" defaultValue={q ?? ""} placeholder="Search order #, customer name or phone" />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      <Card className="overflow-hidden">
        {result.rows.length === 0 ? (
          <AdminEmptyState icon={ClipboardList} title="No orders match this filter." />
        ) : (
          <div className="overflow-x-auto"><table className="tabular w-full min-w-[42rem] text-sm">
            <thead className="border-b border-[var(--color-hairline)] bg-[color-mix(in_srgb,var(--color-ink)_3%,transparent)] text-left text-xs font-medium text-[var(--color-muted-ink)]">
              <tr>
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Placed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-hairline)]">
              {result.rows.map((order) => (
                <tr key={order.id} className="hover:bg-[color-mix(in_srgb,var(--color-ink)_3%,transparent)]">
                  <td className="px-4 py-3">
                    <Link href={`${adminPath(restaurantSlug)}/orders/${order.orderNumber}`} className="font-medium text-[var(--color-brand)] hover:underline">
                      {order.orderNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <p>{order.customerName}</p>
                    <p className="text-xs text-[var(--color-muted-ink)]">{order.customerPhone}</p>
                  </td>
                  <td className="px-4 py-3">{ORDER_TYPE_LABELS[order.orderType]}</td>
                  <td className="px-4 py-3 font-medium">{formatMoney(order.total, { currency: restaurant.currency })}</td>
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

      <AdminPagination page={pageNum} totalPages={result.totalPages} linkFor={(page) => linkFor({ page })} />
    </div>
  );
}
