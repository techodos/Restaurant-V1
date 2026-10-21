import type { Metadata } from "next";
import { whatsappStage } from "@/shared/whatsapp-order";
import { Suspense } from "react";
import { adminPath } from "@/shared/utils";
import Link from "next/link";
import { Bike, ChefHat, ChevronRight, ClipboardList, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listOrdersForStaff } from "@/server/services/orders";
import { ORDER_STATUS_LABELS, ORDER_TYPES, ORDER_TYPE_LABELS, PAYMENT_METHOD_LABELS, type OrderStatus, type OrderType, type PaymentStatus } from "@/shared/contract/enums";
import { adminOrderFilterSearch, hasAdminOrderFilters, parseAdminOrderFilters, type AdminOrderFilters } from "@/shared/order-filters";
import { OrderFilterBar } from "@/components/admin/order-filter-bar";
import { formatMoney } from "@/shared/money";
import { nextOrderStep } from "@/shared/order-flow";
import { getAdminBranchScope, getAdminOrderStatusCounts, getAdminRestaurant } from "@/web/admin";
import { requireAdminPage } from "@/web/session";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatusTabs } from "@/components/admin/admin-status-tabs";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminTableSkeleton, AdminTabsSkeleton } from "@/components/admin/admin-skeleton";
import { StatusPill, WhatsAppOrderBadge, orderStatusTone, statusEdge, statusEdgeCell, statusEdgeStyle, tableHead, tableRow } from "@/components/admin/admin-ui";
import { OrderNextStepButton } from "@/components/admin/order-next-step-button";
import { OrderBulkProvider, OrderSelectAll, OrderSelectBox, type BulkOrder } from "@/components/admin/order-bulk-actions";
import { instanceRestaurantSlug } from "@/web/instance";

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
  searchParams: Promise<{ status?: string; q?: string; page?: string; type?: string; pay?: string; from?: string; to?: string }>;
}

export default async function AdminOrdersPage({ searchParams }: OrdersPageProps) {
  const restaurantSlug = instanceRestaurantSlug();
  const actor = await requireAdminPage("orders.view", restaurantSlug);
  const { status, q: rawQ, page, ...filterParams } = await searchParams;
  const q = rawQ?.trim() || undefined;
  const filters = parseAdminOrderFilters(filterParams);
  const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };

  const activeStatus = (status ?? "active") as "active" | "all" | OrderStatus;
  const pageNum = Number.parseInt(page ?? "1", 10) || 1;
  // the branch comes from the header's selector (owner/admin) or the member's own branch — never the URL
  const { locationId } = await getAdminBranchScope(restaurantSlug);

  // side by side (the staff check already tied this session to this slug's restaurant)
  const [restaurant, counts] = await Promise.all([
    getAdminRestaurant(restaurantSlug),
    getAdminOrderStatusCounts(actor.restaurantId, actor.userId, actor.name, locationId),
  ]);
  const canUpdate = actor.permissions.includes("orders.update_status");
  const allBranches = locationId === null;

  const countFor = (key: string): number => {
    if (key === "all") return Object.values(counts).reduce((sum, n) => sum + n, 0);
    if (key === "active") return counts.pending + counts.confirmed + counts.preparing + counts.ready + counts.out_for_delivery;
    return counts[key as OrderStatus] ?? 0;
  };

  // tabs and pages keep the search and the filters
  const linkFor = (params: { status?: string; page?: number }) => {
    const search = new URLSearchParams();
    search.set("status", params.status ?? activeStatus);
    if (q) search.set("q", q);
    for (const [key, value] of adminOrderFilterSearch(filters)) search.set(key, value);
    if (params.page && params.page > 1) search.set("page", String(params.page));
    return `${adminPath()}/orders?${search.toString()}`;
  };
  const placed = (iso: string) => new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-5">
      {/* keyed on everything the query depends on, so a filter/search/page change always suspends and
          shows the skeleton again, instead of Next reusing the already-resolved boundary */}
      <Suspense
        key={`${activeStatus}:${q ?? ""}:${pageNum}:${locationId ?? "all"}:${adminOrderFilterSearch(filters).join("|")}`}
        fallback={<OrdersResultsSkeleton kitchenLink={actor.permissions.includes("kitchen.view")} />}
      >
        <OrdersResults
          restaurant={restaurant}
          actor={actor}
          ctx={ctx}
          activeStatus={activeStatus}
          q={q}
          filters={filters}
          pageNum={pageNum}
          locationId={locationId}
          counts={counts}
          countFor={countFor}
          linkFor={linkFor}
          placed={placed}
          canUpdate={canUpdate}
          allBranches={allBranches}
        />
      </Suspense>
    </div>
  );
}

async function OrdersResults({
  restaurant,
  actor,
  ctx,
  activeStatus,
  q,
  filters,
  pageNum,
  locationId,
  counts,
  countFor,
  linkFor,
  placed,
  canUpdate,
  allBranches,
}: {
  restaurant: Awaited<ReturnType<typeof getAdminRestaurant>>;
  actor: Awaited<ReturnType<typeof requireAdminPage>>;
  ctx: { restaurantId: string; userId: string; actor: string };
  activeStatus: "active" | "all" | OrderStatus;
  q?: string;
  filters: AdminOrderFilters;
  pageNum: number;
  locationId: string | null;
  counts: Awaited<ReturnType<typeof getAdminOrderStatusCounts>>;
  countFor: (key: string) => number;
  linkFor: (params: { status?: string; page?: number }) => string;
  placed: (iso: string) => string;
  canUpdate: boolean;
  allBranches: boolean;
}) {
  const result = await listOrdersForStaff(
    actor.restaurantId,
    { status: activeStatus, search: q, ...filters, timezone: restaurant.timezone, locationId: locationId ?? undefined, page: pageNum, pageSize: PAGE_SIZE },
    ctx,
  );
  const narrowed = Boolean(q) || hasAdminOrderFilters(filters);
  const bulkOrders: BulkOrder[] = canUpdate
    ? result.rows.flatMap((order) => {
        const next = nextOrderStep(order.status, order.orderType);
        return next ? [{ id: order.id, orderNumber: order.orderNumber, next }] : [];
      })
    : [];

  return (
    <>
      <AdminPageHeader
        title="Orders"
        description={`${result.total} ${result.total === 1 ? "order" : "orders"}${q ? ` matching “${q}”` : narrowed ? " match these filters" : ""}${counts.pending > 0 ? ` · ${counts.pending} waiting for confirmation` : ""}`}
        actions={
          actor.permissions.includes("kitchen.view") ? (
            <Button asChild variant="outline" size="sm">
              <Link href={adminPath("/kitchen")}>
                <ChefHat className="size-4" aria-hidden /> Kitchen view
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col gap-3">
        <AdminStatusTabs
          label="Order status"
          options={TABS.map((tab) => ({ key: tab.key, label: tab.label, count: narrowed ? undefined : countFor(tab.key) }))}
          active={activeStatus}
          linkFor={(key) => linkFor({ status: key })}
        />
        <OrderFilterBar
          action={adminPath("/orders")}
          // the default Active tab would hide an old completed/cancelled order: a search from it looks in every status
          status={activeStatus === "active" ? "all" : activeStatus}
          q={q}
          type={filters.orderType}
          pay={filters.paymentStatus}
          from={filters.dateFrom}
          to={filters.dateTo}
          typeOptions={ORDER_TYPES.map((value) => ({ value, label: ORDER_TYPE_LABELS[value] }))}
          payOptions={Object.entries(PAYMENT_STATE).map(([value, label]) => ({ value, label }))}
          clearHref={narrowed ? `${adminPath()}/orders?status=${activeStatus}` : undefined}
        />
      </div>

      <OrderBulkProvider orders={bulkOrders}>
        <Card className="overflow-hidden max-xl:overflow-visible max-xl:border-0! max-xl:bg-transparent! max-xl:shadow-none!">
          {result.rows.length === 0 ? (
            <AdminEmptyState
              icon={ClipboardList}
              title={q ? "No orders match this search." : "No orders match this filter."}
              action={
                narrowed && activeStatus !== "all" ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={linkFor({ status: "all" })} prefetch={false}>Search all statuses</Link>
                  </Button>
                ) : null
              }
              className="max-xl:surface-card"
            />
          ) : (
            <>
              {/* phones, tablets and small laptops: one card per order (touch-sized actions), two columns from md */}
              <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 xl:hidden">
                {result.rows.map((order) => {
                  const next = canUpdate ? nextOrderStep(order.status, order.orderType) : null;
                  const href = `${adminPath()}/orders/${order.orderNumber}`;
                  return (
                    <li key={order.id} className={`surface-card ${statusEdge} flex flex-col gap-2.5 py-4 pl-5 pr-4 md:pl-6 md:pr-5`} style={statusEdgeStyle(orderStatusTone(order.status))}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          {next ? <span className="pt-1"><OrderSelectBox orderId={order.id} orderNumber={order.orderNumber} /></span> : null}
                          <div>
                            <Link href={href} prefetch={false} className="tabular font-semibold text-[var(--color-ink)]">{order.orderNumber}</Link>
                            {order.source === "whatsapp" ? <WhatsAppOrderBadge stage={whatsappStage(order)} className="ml-2 align-middle" /> : null}
                            <p className="text-xs text-[var(--color-muted-ink)]">{placed(order.createdAt)} · {ORDER_TYPE_LABELS[order.orderType]}</p>
                          </div>
                        </div>
                        <StatusPill tone={orderStatusTone(order.status)}>{ORDER_STATUS_LABELS[order.status]}</StatusPill>
                      </div>
                      <div className="text-sm">
                        <p className="font-medium">{order.customerName}</p>
                        <p className="truncate text-xs text-[var(--color-muted-ink)]">{order.itemPreview.join(", ")}</p>
                      </div>
                      <div className="mt-auto flex items-center justify-between gap-3 border-t border-[var(--color-hairline)] pt-3">
                        <span className="tabular">
                          <span className="block font-semibold">{formatMoney(order.total, { currency: restaurant.currency })}</span>
                          <span className="block text-xs text-[var(--color-muted-ink)]">
                            {PAYMENT_METHOD_LABELS[order.paymentMethod]} · {PAYMENT_STATE[order.paymentStatus] ?? order.paymentStatus}
                          </span>
                        </span>
                        {next ? (
                          <OrderNextStepButton orderId={order.id} orderNumber={order.orderNumber} next={next.status} label={next.label} />
                        ) : (
                          <Button asChild variant="outline" size="sm"><Link href={href} prefetch={false}>View</Link></Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* wide laptops and up: the table */}
              <div className="relative hidden overflow-x-auto xl:block">
                <table className="tabular w-full min-w-[50rem] text-sm">
                  <thead className={tableHead}>
                    <tr>
                      {bulkOrders.length > 0 ? <th className="w-10 py-3 pl-4"><OrderSelectAll /></th> : null}
                      <th className="px-4 py-3 font-semibold">Order</th>
                      <th className="px-4 py-3 font-semibold">Customer</th>
                      <th className="px-4 py-3 font-semibold">Items</th>
                      <th className="px-4 py-3 text-right font-semibold">Total</th>
                      <th className="px-4 py-3 font-semibold">Status</th>
                      <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-hairline)]">
                    {result.rows.map((order) => {
                      const next = canUpdate ? nextOrderStep(order.status, order.orderType) : null;
                      const href = `${adminPath()}/orders/${order.orderNumber}`;
                      const TypeIcon = TYPE_ICON[order.orderType];
                      return (
                        <tr key={order.id} className={tableRow} style={statusEdgeStyle(orderStatusTone(order.status))}>
                          {bulkOrders.length > 0 ? (
                            <td className={`${statusEdgeCell} py-3 pl-4`}>{next ? <OrderSelectBox orderId={order.id} orderNumber={order.orderNumber} /> : null}</td>
                          ) : null}
                          <td className={`whitespace-nowrap px-4 py-3 ${bulkOrders.length > 0 ? "" : statusEdgeCell}`}>
                            <Link href={href} prefetch={false} className="font-semibold text-[var(--color-ink)] hover:text-[var(--color-brand)] hover:underline">
                              {order.orderNumber}
                            </Link>
                            {order.source === "whatsapp" ? <WhatsAppOrderBadge stage={whatsappStage(order)} className="ml-2 align-middle" /> : null}
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
                          <td className="max-w-[13rem] px-4 py-3">
                            <p className="truncate" title={order.itemPreview.join(", ")}>{order.itemPreview.join(", ") || "—"}</p>
                            <p className="text-xs text-[var(--color-muted-ink)]">
                              {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            <p className="font-semibold">{formatMoney(order.total, { currency: restaurant.currency })}</p>
                            <p className="text-xs text-[var(--color-muted-ink)]">{PAYMENT_METHOD_LABELS[order.paymentMethod]}</p>
                            <p className="text-xs text-[var(--color-muted-ink)]">{PAYMENT_STATE[order.paymentStatus] ?? order.paymentStatus}</p>
                          </td>
                          <td className="px-4 py-3">
                            <StatusPill tone={orderStatusTone(order.status)}>{ORDER_STATUS_LABELS[order.status]}</StatusPill>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            {next ? (
                              <OrderNextStepButton orderId={order.id} orderNumber={order.orderNumber} next={next.status} label={next.label} />
                            ) : (
                              <Link href={href} prefetch={false} className="inline-flex items-center gap-1 rounded px-1 text-[13px] font-medium text-[var(--color-muted-ink)] hover:text-[var(--color-ink)]">
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
            <div className="border-t border-[var(--color-hairline)] px-4 py-3 max-xl:mt-3 max-xl:border-0 max-xl:px-0">
              <AdminPagination page={pageNum} totalPages={result.totalPages} total={result.total} pageSize={PAGE_SIZE} linkFor={(page) => linkFor({ page })} />
            </div>
          ) : null}
        </Card>
      </OrderBulkProvider>
    </>
  );
}

function OrdersResultsSkeleton({ kitchenLink }: { kitchenLink: boolean }) {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading orders">
      <AdminPageHeader
        title="Orders"
        description={<Skeleton className="h-4 w-24" />}
        actions={kitchenLink ? <Skeleton className="h-9 w-32 rounded-[var(--radius-card)]" /> : null}
      />
      <div className="flex flex-col gap-3">
        <AdminTabsSkeleton count={9} />
        <Skeleton className="h-10 w-full max-w-md" />
        <Skeleton className="h-[3.75rem] w-full max-w-2xl" />
      </div>
      <AdminTableSkeleton rows={8} cols={6} />
    </div>
  );
}
