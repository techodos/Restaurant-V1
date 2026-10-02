import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, ClipboardList, Download, Percent, ReceiptText, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getSalesReport, listOrdersForStaff } from "@/server/services/orders";
import { ORDER_STATUS_LABELS, ORDER_TYPE_LABELS } from "@/shared/contract/enums";
import { formatMoney } from "@/shared/money";
import { REPORT_RANGE_LABELS, REPORT_RANGE_PRESETS, resolveReportRange, type ReportRangePreset } from "@/shared/reports";
import { getAdminRestaurant } from "@/web/admin";
import { requirePermission } from "@/web/session";
import { adminPath } from "@/shared/utils";
import { orderStatusBadgeVariant } from "@/components/admin/order-status-badge";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatusTabs } from "@/components/admin/admin-status-tabs";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { OrdersTrendChart, PaymentBreakdownList, SalesTrendChart } from "@/components/admin/sales-charts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sales Reports" };

interface ReportsPageProps {
  params: Promise<{ restaurantSlug: string }>;
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: typeof Banknote;
  label: string;
  value: string;
  tone?: "neutral" | "danger";
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted-ink)]">{label}</p>
          <p className={`tabular mt-1.5 text-[1.6rem] font-semibold leading-none ${tone === "danger" ? "text-[var(--color-danger)]" : ""}`}>
            {value}
          </p>
        </div>
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--tint-strong)] text-[var(--color-muted-ink)]">
          <Icon className="size-[18px]" aria-hidden />
        </span>
      </CardContent>
    </Card>
  );
}

export default async function AdminReportsPage({ params, searchParams }: ReportsPageProps) {
  const { restaurantSlug } = await params;
  const actor = await requirePermission("analytics.view", restaurantSlug);
  const restaurant = await getAdminRestaurant(restaurantSlug);
  const { preset, from, to } = await searchParams;
  const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };

  const range = resolveReportRange(preset, from, to, restaurant.timezone);

  const [report, recentInRange] = await Promise.all([
    getSalesReport(restaurant.id, range, restaurant.timezone, ctx),
    listOrdersForStaff(restaurant.id, { dateFrom: range.fromDateKey, dateTo: range.toDateKey, status: "all", page: 1, pageSize: 10 }, ctx),
  ]);

  const linkFor = (nextPreset: ReportRangePreset) => `${adminPath(restaurantSlug)}/reports?preset=${nextPreset}`;
  const exportHref = `${adminPath(restaurantSlug)}/reports/export?preset=${range.preset}&from=${range.fromDateKey}&to=${range.toDateKey}`;
  const hasSales = report.dailyTrend.some((point) => Number(point.sales) > 0 || point.orders > 0);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Sales Reports"
        description={`${range.fromDateKey === range.toDateKey ? range.fromDateKey : `${range.fromDateKey} – ${range.toDateKey}`} · ${restaurant.name}`}
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="secondary" size="sm">
              <a href={`${exportHref}&format=csv`} download>
                <Download className="size-4" aria-hidden />
                CSV
              </a>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <a href={`${exportHref}&format=xlsx`} download>
                <Download className="size-4" aria-hidden />
                Excel
              </a>
            </Button>
            <Button asChild variant="secondary" size="sm">
              <a href={`${exportHref}&format=pdf`} download>
                <Download className="size-4" aria-hidden />
                PDF
              </a>
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <AdminStatusTabs
          options={REPORT_RANGE_PRESETS.filter((p) => p !== "custom").map((p) => ({ key: p, label: REPORT_RANGE_LABELS[p] }))}
          active={range.preset === "custom" ? ("today" as ReportRangePreset) : range.preset}
          linkFor={linkFor}
        />
        <form action={adminPath(restaurantSlug, "/reports")} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="preset" value="custom" />
          <div>
            <Label htmlFor="from" className="sr-only">From</Label>
            <Input id="from" name="from" type="date" defaultValue={range.preset === "custom" ? range.fromDateKey : undefined} className="h-10 w-auto" />
          </div>
          <div>
            <Label htmlFor="to" className="sr-only">To</Label>
            <Input id="to" name="to" type="date" defaultValue={range.preset === "custom" ? range.toDateKey : undefined} className="h-10 w-auto" />
          </div>
          <Button type="submit" size="sm" variant="secondary">
            Apply
          </Button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard icon={Banknote} label="Total sales" value={formatMoney(report.totalSales, { currency: restaurant.currency })} />
        <StatCard icon={ClipboardList} label="Total orders" value={String(report.totalOrders)} />
        <StatCard icon={ReceiptText} label="Completed" value={String(report.completedOrders)} />
        <StatCard icon={XCircle} label="Cancelled" value={String(report.cancelledOrders)} tone={report.cancelledOrders > 0 ? "danger" : "neutral"} />
        <StatCard icon={Percent} label="Avg. order value" value={formatMoney(report.averageOrderValue, { currency: restaurant.currency })} />
      </div>

      {report.totalDiscounts !== "0.00" ? (
        <p className="text-sm text-[var(--color-muted-ink)]">
          Total discounts given: <span className="tabular font-medium text-[var(--color-ink)]">{formatMoney(report.totalDiscounts, { currency: restaurant.currency })}</span>
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
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
          <div className="overflow-x-auto">
            <table className="tabular w-full min-w-[42rem] text-sm">
              <thead className="border-b border-[var(--color-hairline)] bg-[color-mix(in_srgb,var(--color-ink)_3%,transparent)] text-left text-xs font-medium text-[var(--color-muted-ink)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Placed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-hairline)]">
                {recentInRange.rows.map((order) => (
                  <tr key={order.id} className="hover:bg-[color-mix(in_srgb,var(--color-ink)_3%,transparent)]">
                    <td className="px-4 py-3">
                      <Link href={`${adminPath(restaurantSlug)}/orders/${order.orderNumber}`} className="font-medium text-[var(--color-brand)] hover:underline">
                        {order.orderNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{ORDER_TYPE_LABELS[order.orderType]}</td>
                    <td className="px-4 py-3 font-medium">{formatMoney(order.total, { currency: restaurant.currency })}</td>
                    <td className="px-4 py-3">
                      <Badge variant={orderStatusBadgeVariant(order.status)}>{ORDER_STATUS_LABELS[order.status]}</Badge>
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
    </div>
  );
}
