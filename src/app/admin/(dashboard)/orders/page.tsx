import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getOrderStatusCounts, listOrdersForStaff } from "@/server/services/orders";
import { ORDER_STATUS_LABELS, ORDER_TYPE_LABELS, type OrderStatus } from "@/shared/contract/enums";
import { formatMoney } from "@/shared/money";
import { cn } from "@/shared/utils";
import { getAdminRestaurant } from "@/web/admin";
import { requirePermission } from "@/web/session";
import { orderStatusBadgeVariant } from "@/components/admin/order-status-badge";

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
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}

export default async function AdminOrdersPage({ searchParams }: OrdersPageProps) {
  const actor = await requirePermission("orders.view");
  const restaurant = await getAdminRestaurant();
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
    return `/admin/orders?${search.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">Orders</h1>
        <p className="mt-1 text-[var(--color-muted-ink)]">{result.total} total</p>
      </div>

      <nav className="-mx-1 flex snap-x gap-2 overflow-x-auto pb-1">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={linkFor({ status: tab.key })}
            className={cn(
              "snap-start whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm transition-colors",
              activeStatus === tab.key
                ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-[var(--color-brand-foreground)]"
                : "border-[var(--color-hairline)] bg-[var(--color-surface)] hover:border-[var(--color-brand)]",
            )}
          >
            {tab.label} <span className="ml-1 text-xs opacity-75">{countFor(tab.key)}</span>
          </Link>
        ))}
      </nav>

      <form action="/admin/orders" className="flex max-w-md gap-2">
        <input type="hidden" name="status" value={activeStatus} />
        <Input name="q" defaultValue={q ?? ""} placeholder="Search order #, customer name or phone" />
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      <Card className="overflow-hidden">
        {result.rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-[var(--color-muted-ink)]">No orders match this filter.</p>
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
                    <Link href={`/admin/orders/${order.orderNumber}`} className="font-medium text-[var(--color-brand)] hover:underline">
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

      {result.totalPages > 1 ? (
        <div className="flex items-center justify-center gap-3">
          <Button asChild variant="outline" size="sm" className={pageNum <= 1 ? "pointer-events-none opacity-40" : ""}>
            <Link href={linkFor({ page: pageNum - 1 })} aria-disabled={pageNum <= 1}>
              Previous
            </Link>
          </Button>
          <span className="text-sm text-[var(--color-muted-ink)]">
            Page {pageNum} of {result.totalPages}
          </span>
          <Button
            asChild
            variant="outline"
            size="sm"
            className={pageNum >= result.totalPages ? "pointer-events-none opacity-40" : ""}
          >
            <Link href={linkFor({ page: pageNum + 1 })} aria-disabled={pageNum >= result.totalPages}>
              Next
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
