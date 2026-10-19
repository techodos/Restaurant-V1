import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import Form from "next/form";
import { Banknote, ClipboardList, Download, Percent, ReceiptText, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getSalesReport, listOrdersForStaff } from "@/server/services/orders";
import { ORDER_STATUS_LABELS, ORDER_TYPE_LABELS } from "@/shared/contract/enums";
import { formatMoney } from "@/shared/money";
import { REPORT_RANGE_LABELS, REPORT_RANGE_PRESETS, resolveReportRange, type ReportRange, type ReportRangePreset } from "@/shared/reports";
import { getAdminBranchScope, getAdminRestaurant } from "@/web/admin";
import { requireAdminPage } from "@/web/session";
import { adminPath } from "@/shared/utils";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ReportRangePicker } from "@/components/admin/report-range-picker";
import { AdminStatusTabs } from "@/components/admin/admin-status-tabs";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminStatSkeleton } from "@/components/admin/admin-skeleton";
import { OrdersTrendChart, PaymentBreakdownList, SalesTrendChart } from "@/components/admin/sales-charts";
import { StatTile, StatusPill, orderStatusTone, tableHead, tableRow } from "@/components/admin/admin-ui";
import { formatDateKey } from "@/shared/hours";
import { instanceRestaurantSlug } from "@/web/instance";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sales Reports" };

interface ReportsPageProps {
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
}

const EXPORTS = [
  { format: "csv", label: "CSV" },
  { format: "xlsx", label: "Excel" },
  { format: "pdf", label: "PDF" },
] as const;

export default async function AdminReportsPage({ searchParams }: ReportsPageProps) {
  const restaurantSlug = instanceRestaurantSlug();
  const actor = await requireAdminPage("analytics.view", restaurantSlug);
  const [restaurant, scope] = await Promise.all([getAdminRestaurant(restaurantSlug), getAdminBranchScope(restaurantSlug)]);
  const { locationId } = scope; // a manager: always their branch; owner/admin: the header's choice (null = all)
  const { preset, from, to } = await searchParams;
  const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };

  const range = resolveReportRange(preset, from, to, restaurant.timezone);

  const linkFor = (nextPreset: ReportRangePreset) => `${adminPath()}/reports?preset=${nextPreset}`;
  const exportHref = `${adminPath()}/reports/export?preset=${range.preset}&from=${range.fromDateKey}&to=${range.toDateKey}`;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Sales Reports"
        description={`${range.fromDateKey === range.toDateKey ? formatDateKey(range.fromDateKey, undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : `${formatDateKey(range.fromDateKey, undefined, { day: "numeric", month: "short" })} – ${formatDateKey(range.toDateKey, undefined, { day: "numeric", month: "short", year: "numeric" })}`}`}
        actions={
          <div className="flex items-center gap-2">
            <span className="hidden text-[13px] font-medium text-[var(--color-muted-ink)] sm:inline">Export</span>
            <div className="inline-flex overflow-hidden rounded-full bg-[var(--color-surface)] shadow-[0_1px_2px_color-mix(in_srgb,var(--color-ink)_8%,transparent)] ring-1 ring-[var(--admin-line,var(--color-hairline))]">
              {EXPORTS.map((entry, index) => (
                <a
                  key={entry.format}
                  href={`${exportHref}&format=${entry.format}`}
                  download
                  className={`inline-flex min-h-10 items-center gap-1.5 px-3.5 text-[13px] font-semibold transition-colors hover:bg-[color-mix(in_srgb,var(--color-brand)_7%,transparent)] hover:text-[var(--color-brand)] ${index > 0 ? "border-l border-[var(--admin-line,var(--color-hairline))]" : ""}`}
                >
                  <Download className="size-3.5" aria-hidden />
                  {entry.label}
                </a>
              ))}
            </div>
          </div>
        }
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <AdminStatusTabs
          options={REPORT_RANGE_PRESETS.filter((p) => p !== "custom").map((p) => ({ key: p, label: REPORT_RANGE_LABELS[p] }))}
          active={range.preset === "custom" ? ("today" as ReportRangePreset) : range.preset}
          linkFor={linkFor}
        />
        {/* phones: one button -> a calendar sheet (tap From, then To) */}
        <div className="w-full sm:hidden">
          <ReportRangePicker
            action={adminPath("/reports")}
            today={resolveReportRange("today", null, null, restaurant.timezone).toDateKey}
            initialFrom={range.preset === "custom" ? range.fromDateKey : undefined}
            initialTo={range.preset === "custom" ? range.toDateKey : undefined}
          />
        </div>
        {/* sm+: a compact "from – to" pill with the browser's own date fields */}
        <Form action={adminPath("/reports")} className="hidden items-center gap-2 sm:flex">
          <input type="hidden" name="preset" value="custom" />
          <div className="flex items-center gap-1.5 rounded-full bg-[var(--color-surface)] px-2 shadow-[0_1px_2px_color-mix(in_srgb,var(--color-ink)_6%,transparent)] ring-1 ring-[var(--admin-line,var(--color-hairline))]">
            <Input
              id="from"
              name="from"
              type="date"
              aria-label="From"
              defaultValue={range.preset === "custom" ? range.fromDateKey : undefined}
              className="h-10 w-[9.5rem] border-0! bg-transparent px-2 shadow-none!"
            />
            <span aria-hidden className="text-[var(--color-muted-ink)]">–</span>
            <Input
              id="to"
              name="to"
              type="date"
              aria-label="To"
              defaultValue={range.preset === "custom" ? range.toDateKey : undefined}
              className="h-10 w-[9.5rem] border-0! bg-transparent px-2 shadow-none!"
            />
          </div>
          <Button type="submit" size="sm" variant={range.preset === "custom" ? "primary" : "secondary"} className="h-10 rounded-full px-4">
            Apply
          </Button>
        </Form>
      </div>

      {/* keyed on the range + branch so a filter change always suspends and shows the skeleton again,
          instead of Next reusing the already-resolved boundary from the previous search params */}
      <Suspense key={`${range.fromDateKey}:${range.toDateKey}:${locationId ?? "all"}`} fallback={<ReportsResultsSkeleton />}>
        <ReportsResults restaurant={restaurant} range={range} locationId={locationId} ctx={ctx} />
      </Suspense>
    </div>
  );
}

async function ReportsResults({
  restaurant,
  range,
  locationId,
  ctx,
}: {
  restaurant: Awaited<ReturnType<typeof getAdminRestaurant>>;
  range: ReportRange;
  locationId: string | null;
  ctx: { restaurantId: string; userId: string; actor: string };
}) {
  const [report, recentInRange] = await Promise.all([
    getSalesReport(restaurant.id, range, restaurant.timezone, ctx, locationId),
    listOrdersForStaff(
      restaurant.id,
      { dateFrom: range.fromDateKey, dateTo: range.toDateKey, timezone: restaurant.timezone, status: "all", locationId: locationId ?? undefined, page: 1, pageSize: 10 },
      ctx,
    ),
  ]);
  const hasSales = report.dailyTrend.some((point) => Number(point.sales) > 0 || point.orders > 0);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile size="lg" className="col-span-2 lg:row-span-2" icon={Banknote} label="Total sales" value={formatMoney(report.totalSales, { currency: restaurant.currency })} note="Completed orders" />
        <StatTile icon={ClipboardList} label="Orders" value={String(report.totalOrders)} tone="info" />
        <StatTile icon={ReceiptText} label="Completed" value={String(report.completedOrders)} tone="success" />
        <StatTile icon={XCircle} label="Cancelled" value={String(report.cancelledOrders)} tone={report.cancelledOrders > 0 ? "danger" : "neutral"} />
        <StatTile icon={Percent} label="Avg. order" value={formatMoney(report.averageOrderValue, { currency: restaurant.currency })} tone="neutral" />
      </div>

      {report.totalDiscounts !== "0.00" ? (
        <p className="text-sm text-[var(--color-muted-ink)]">
          Total discounts given: <span className="tabular font-medium text-[var(--color-ink)]">{formatMoney(report.totalDiscounts, { currency: restaurant.currency })}</span>
        </p>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Sales trend</CardTitle>
            <CardDescription>Completed-order revenue per day.</CardDescription>
          </CardHeader>
          <CardContent>
            {hasSales ? (
              <SalesTrendChart data={report.dailyTrend} currency={restaurant.currency} />
            ) : (
              <AdminEmptyState title="No sales data for this period." className="py-16" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment methods</CardTitle>
            <CardDescription>Completed orders only.</CardDescription>
          </CardHeader>
          <CardContent>
            {report.paymentBreakdown.length === 0 ? (
              <AdminEmptyState title="No sales data for this period." className="py-16" />
            ) : (
              <PaymentBreakdownList rows={report.paymentBreakdown} currency={restaurant.currency} />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Orders per day</CardTitle>
          <CardDescription>Every status, including cancelled.</CardDescription>
        </CardHeader>
        <CardContent>
          {hasSales ? (
            <OrdersTrendChart data={report.dailyTrend} />
          ) : (
            <AdminEmptyState title="No orders in this period." className="py-16" />
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>Most recent in range</CardTitle>
          <CardDescription>The 10 latest orders in this period — export for the full list.</CardDescription>
        </CardHeader>
        {recentInRange.rows.length === 0 ? (
          <AdminEmptyState icon={ClipboardList} title="No orders in this period." />
        ) : (
          <div className="relative overflow-x-auto">
            <table className="tabular w-full min-w-[42rem] text-sm">
              <thead className={tableHead}>
                <tr>
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Placed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--admin-line,var(--color-hairline))]">
                {recentInRange.rows.map((order) => (
                  <tr key={order.id} className={tableRow}>
                    <td className="px-4 py-3">
                      <Link href={`${adminPath()}/orders/${order.orderNumber}`} prefetch={false} className="font-medium text-[var(--color-brand)] hover:underline">
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{ORDER_TYPE_LABELS[order.orderType]}</td>
                    <td className="px-4 py-3 font-medium">{formatMoney(order.total, { currency: restaurant.currency })}</td>
                    <td className="px-4 py-3">
                      <StatusPill tone={orderStatusTone(order.status)}>{ORDER_STATUS_LABELS[order.status]}</StatusPill>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted-ink)]">
                      {new Date(order.createdAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

function ReportsResultsSkeleton() {
  return (
    <>
      <AdminStatSkeleton count={5} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card className="p-6"><Skeleton className="h-[260px] w-full" /></Card>
        <Card className="p-6"><Skeleton className="h-[260px] w-full" /></Card>
      </div>
      <Card className="p-6"><Skeleton className="h-[200px] w-full" /></Card>
      <Card className="p-6"><Skeleton className="h-[220px] w-full" /></Card>
    </>
  );
}
