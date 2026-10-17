import type { Metadata } from "next";
import { adminPath } from "@/shared/utils";
import Link from "next/link";
import { Bike, ChefHat, ChevronRight, ClipboardList, Search, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getOrderStatusCounts, listOrdersForStaff } from "@/server/services/orders";
import { ORDER_STATUS_LABELS, ORDER_TYPE_LABELS, PAYMENT_METHOD_LABELS, type OrderStatus, type OrderType, type PaymentStatus } from "@/shared/contract/enums";
import { formatMoney } from "@/shared/money";
import { nextOrderStep } from "@/shared/order-flow";
import { getAdminBranchScope, getAdminRestaurant } from "@/web/admin";
import { requireAdminPage } from "@/web/session";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatusTabs } from "@/components/admin/admin-status-tabs";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { StatusPill, orderStatusTone, tableHead, tableRow } from "@/components/admin/admin-ui";
import { OrderNextStepButton } from "@/components/admin/order-next-step-button";

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

const TYPE_ICON: Record<OrderType, typeof Bike> = { delivery: Bike, pickup: ShoppingBag, dine_in: UtensilsCrossed };
const PAYMENT_STATE: Partial<Record<PaymentStatus, string>> = { paid: "Paid", pending: "Not paid yet", authorized: "Authorised", failed: "Payment failed", refunded: "Refunded", cancelled: "Payment cancelled" };
const PAGE_SIZE = 20;

interface OrdersPageProps {
  params: Promise<{ restaurantSlug: string }>;
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}

export default async function AdminOrdersPage({ params, searchParams }: OrdersPageProps) {
  const { restaurantSlug } = await params;
  const actor = await requireAdminPage("orders.view", restaurantSlug);
  const { status, q, page } = await searchParams;
  const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };

  const activeStatus = (status ?? "active") as "active" | "all" | OrderStatus;
  const pageNum = Number.parseInt(page ?? "1", 10) || 1;
  // the branch comes from the header's selector (owner/admin) or the member's own branch — never the URL
  const { locationId } = await getAdminBranchScope(restaurantSlug);

  // side by side (the staff check already tied this session to this slug's restaurant)
  const [restaurant, counts, result] = await Promise.all([
    getAdminRestaurant(restaurantSlug),
    getOrderStatusCounts(actor.restaurantId, ctx, locationId),
    listOrdersForStaff(actor.restaurantId, { status: activeStatus, search: q, locationId: locationId ?? undefined, page: pageNum, pageSize: PAGE_SIZE }, ctx),
  ]);
  const canUpdate = actor.permissions.includes("orders.update_status");
  const allBranches = locationId === null;

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
  const placed = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Orders"
        description={`${result.total} ${result.total === 1 ? "order" : "orders"}${q ? ` matching “${q}”` : ""}${counts.pending > 0 ? ` · ${counts.pending} waiting for confirmation` : ""}`}
        actions={
          actor.permissions.includes("kitchen.view") ? (
            <Button asChild variant="outline" size="sm">
              <Link href={adminPath(restaurantSlug, "/kitchen")}>
                <ChefHat className="size-4" aria-hidden /> Kitchen view
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col gap-3">
        <AdminStatusTabs
          label="Order status"
          options={TABS.map((tab) => ({ key: tab.key, label: tab.label, count: countFor(tab.key) }))}
          active={activeStatus}
          linkFor={(key) => linkFor({ status: key })}
        />
        <form action={adminPath(restaurantSlug, "/orders")} role="search" className="flex w-full gap-2 sm:max-w-md">
          <input type="hidden" name="status" value={activeStatus} />
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted-ink)]" aria-hidden />
            <Input name="q" type="search" defaultValue={q ?? ""} aria-label="Search orders" placeholder="Order #, customer or phone" className="h-10 pl-9" />
          </div>
          <Button type="submit" variant="outline" className="h-10">
            Search
          </Button>
        </form>
      </div>

      <Card className="overflow-hidden">
        {result.rows.length === 0 ? (
          <AdminEmptyState icon={ClipboardList} title={q ? "No orders match this search." : "No orders match this filter."} />
        ) : (
          <>
            {/* phones and tablets: one card per order (touch-sized actions) */}
            <ul className="divide-y divide-[var(--color-hairline)] lg:hidden">
              {result.rows.map((order) => {
                const next = canUpdate ? nextOrderStep(order.status, order.orderType) : null;
                const href = `${adminPath(restaurantSlug)}/orders/${order.orderNumber}`;
                return (
                  <li key={order.id} className="space-y-2.5 px-4 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Link href={href} className="tabular font-semibold text-[var(--color-ink)]">{order.orderNumber}</Link>
                        <p className="text-xs text-[var(--color-muted-ink)]">{placed(order.createdAt)} · {ORDER_TYPE_LABELS[order.orderType]}</p>
                      </div>
                      <StatusPill tone={orderStatusTone(order.status)}>{ORDER_STATUS_LABELS[order.status]}</StatusPill>
                    </div>
                    <div className="text-sm">
                      <p className="font-medium">{order.customerName}</p>
                      <p className="truncate text-xs text-[var(--color-muted-ink)]">{order.itemPreview.join(", ")}</p>
                    </div>
                    <div className="flex items-center justify-between gap-3 border-t border-[var(--color-hairline)] pt-3">
                      <span className="tabular font-semibold">{formatMoney(order.total, { currency: restaurant.currency })}</span>
                      {next ? (
                        <OrderNextStepButton orderId={order.id} next={next.status} label={next.label} />
                      ) : (
                        <Button asChild variant="outline" size="sm"><Link href={href}>View</Link></Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* laptop and up: the table */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="tabular w-full min-w-[52rem] text-sm">
                <thead className={tableHead}>
                  <tr>
                    <th className="px-4 py-3 font-semibold">Order</th>
                    <th className="px-4 py-3 font-semibold">Customer</th>
                    <th className="px-4 py-3 font-semibold">Items</th>
                    <th className="px-4 py-3 font-semibold">Payment</th>
                    <th className="px-4 py-3 text-right font-semibold">Total</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-hairline)]">
                  {result.rows.map((order) => {
                    const next = canUpdate ? nextOrderStep(order.status, order.orderType) : null;
                    const href = `${adminPath(restaurantSlug)}/orders/${order.orderNumber}`;
                    const TypeIcon = TYPE_ICON[order.orderType];
                    return (
                      <tr key={order.id} className={tableRow}>
                        <td className="whitespace-nowrap px-4 py-3">
                          <Link href={href} className="font-semibold text-[var(--color-ink)] hover:text-[var(--color-brand)] hover:underline">
                            {order.orderNumber}
                          </Link>
                          <p className="text-xs text-[var(--color-muted-ink)]">{placed(order.createdAt)}</p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <p className="font-medium">{order.customerName}</p>
                          <p className="flex items-center gap-1.5 text-xs text-[var(--color-muted-ink)]">
                            <TypeIcon className="size-3.5" aria-hidden />
                            {ORDER_TYPE_LABELS[order.orderType]}
                            {allBranches && order.locationName ? ` · ${order.locationName}` : ""}
                          </p>
                        </td>
                        <td className="max-w-[18rem] px-4 py-3">
                          <p className="truncate" title={order.itemPreview.join(", ")}>{order.itemPreview.join(", ") || "—"}</p>
                          <p className="text-xs text-[var(--color-muted-ink)]">
                            {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <p>{PAYMENT_METHOD_LABELS[order.paymentMethod]}</p>
                          <p className="text-xs text-[var(--color-muted-ink)]">{PAYMENT_STATE[order.paymentStatus] ?? order.paymentStatus}</p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-semibold">{formatMoney(order.total, { currency: restaurant.currency })}</td>
                        <td className="px-4 py-3">
                          <StatusPill tone={orderStatusTone(order.status)}>{ORDER_STATUS_LABELS[order.status]}</StatusPill>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          {next ? (
                            <OrderNextStepButton orderId={order.id} next={next.status} label={next.label} />
                          ) : (
                            <Link href={href} className="inline-flex items-center gap-1 rounded px-1 text-[13px] font-medium text-[var(--color-muted-ink)] hover:text-[var(--color-ink)]">
                              View <ChevronRight className="size-4" aria-hidden />
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
        {result.totalPages > 1 ? (
          <div className="border-t border-[var(--color-hairline)] px-4 py-3">
            <AdminPagination page={pageNum} totalPages={result.totalPages} total={result.total} pageSize={PAGE_SIZE} linkFor={(page) => linkFor({ page })} />
          </div>
        ) : null}
      </Card>
    </div>
  );
}
