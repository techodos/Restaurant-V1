import type { Metadata } from "next";
import { Suspense } from "react";
import { adminPath } from "@/shared/utils";
import Link from "next/link";
import { CreditCard } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listPaymentsForAdmin } from "@/server/services/payments";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUSES, type PaymentStatus } from "@/shared/contract/enums";
import { formatMoney } from "@/shared/money";
import { getAdminBranchScope, getAdminRestaurant } from "@/web/admin";
import { requireAdminPage } from "@/web/session";
import { PaymentStatusControl } from "@/components/admin/payment-status-control";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatusTabs } from "@/components/admin/admin-status-tabs";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminTableSkeleton, AdminTabsSkeleton } from "@/components/admin/admin-skeleton";
import { StatusPill, badgeTone, tableHead, tableRow } from "@/components/admin/admin-ui";
import { instanceRestaurantSlug } from "@/web/instance";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Payments" };

function label(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}

function badgeVariant(status: PaymentStatus): "success" | "warning" | "danger" | "neutral" {
  if (status === "paid") return "success";
  if (status === "pending" || status === "authorized") return "warning";
  if (status === "failed") return "danger";
  return "neutral";
}

interface PaymentsPageProps {
  searchParams: Promise<{ status?: string; page?: string }>;
}

export default async function AdminPaymentsPage({ searchParams }: PaymentsPageProps) {
  const restaurantSlug = instanceRestaurantSlug();
  const actor = await requireAdminPage("payments.view", restaurantSlug);
  const canManagePayment = actor.permissions.includes("orders.manage");
  const restaurant = await getAdminRestaurant(restaurantSlug);
  const { status, page } = await searchParams;
  const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };

  const activeStatus = (status ?? "all") as "all" | PaymentStatus;
  const pageNum = Number.parseInt(page ?? "1", 10) || 1;
  // the branch comes from the header's selector (owner/admin) or the member's own branch — never the URL
  const { locationId } = await getAdminBranchScope(restaurantSlug);

  const linkFor = (params: { status?: string; page?: number }) => {
    const search = new URLSearchParams();
    search.set("status", params.status ?? activeStatus);
    if (params.page && params.page > 1) search.set("page", String(params.page));
    return `${adminPath()}/payments?${search.toString()}`;
  };

  return (
    <div className="space-y-6">
      {/* keyed on the filter/page/branch so a filter change always suspends and shows the skeleton again */}
      <Suspense key={`${activeStatus}:${pageNum}:${locationId ?? "all"}`} fallback={<PaymentsResultsSkeleton />}>
        <PaymentsResults
          restaurant={restaurant}
          ctx={ctx}
          activeStatus={activeStatus}
          pageNum={pageNum}
          locationId={locationId}
          canManagePayment={canManagePayment}
          linkFor={linkFor}
        />
      </Suspense>
    </div>
  );
}

async function PaymentsResults({
  restaurant,
  ctx,
  activeStatus,
  pageNum,
  locationId,
  canManagePayment,
  linkFor,
}: {
  restaurant: Awaited<ReturnType<typeof getAdminRestaurant>>;
  ctx: { restaurantId: string; userId: string; actor: string };
  activeStatus: "all" | PaymentStatus;
  pageNum: number;
  locationId: string | null;
  canManagePayment: boolean;
  linkFor: (params: { status?: string; page?: number }) => string;
}) {
  const result = await listPaymentsForAdmin(
    restaurant.id,
    { status: activeStatus, locationId: locationId ?? undefined, page: pageNum, pageSize: 20 },
    ctx,
  );

  const paidAt = (value: string) =>
    new Date(value).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <>
      <AdminPageHeader title="Payments" description={`${result.total} ${result.total === 1 ? "payment" : "payments"} recorded`} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <AdminStatusTabs
          options={(["all", ...PAYMENT_STATUSES] as const).map((option) => ({ key: option, label: label(option) }))}
          active={activeStatus}
          linkFor={(key) => linkFor({ status: key })}
        />
      </div>

      {result.rows.length === 0 ? (
        <Card>
          <AdminEmptyState icon={CreditCard} title="No payments match this filter." />
        </Card>
      ) : (
        <>
          {/* phones, tablets, small laptops: one card per payment */}
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 xl:hidden">
            {result.rows.map((payment) => (
              <li key={payment.id} className="surface-card flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`${adminPath()}/orders/${payment.orderNumber}`}
                      prefetch={false}
                      className="tabular whitespace-nowrap font-semibold text-[var(--color-ink)] hover:text-[var(--color-brand)] hover:underline"
                    >
                      {payment.orderNumber}
                    </Link>
                    <p className="truncate text-[13px] text-[var(--color-muted-ink)]">
                      {payment.customerName}
                      {payment.locationName ? ` · ${payment.locationName}` : ""}
                    </p>
                  </div>
                  <StatusPill tone={badgeTone(badgeVariant(payment.status))}>{label(payment.status)}</StatusPill>
                </div>
                <div className="flex items-end justify-between gap-3 border-t border-[var(--admin-line,var(--color-hairline))] pt-3">
                  <div className="tabular min-w-0">
                    <p className="text-[17px] font-semibold">{formatMoney(payment.amount, { currency: restaurant.currency })}</p>
                    <p className="text-[12.5px] text-[var(--color-muted-ink)]">
                      {PAYMENT_METHOD_LABELS[payment.method]}
                      {payment.paidAt ? ` · paid ${paidAt(payment.paidAt)}` : ""}
                    </p>
                  </div>
                  {canManagePayment ? (
                    <PaymentStatusControl orderId={payment.orderId} orderNumber={payment.orderNumber} method={payment.method} status={payment.status} size="xs" />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>

          {/* wide screens: the table, two lines per cell instead of seven cramped columns */}
          <Card className="hidden overflow-hidden xl:block">
            <div className="relative overflow-x-auto">
              <table className="tabular w-full text-sm">
                <thead className={tableHead}>
                  <tr>
                    <th className="px-5 py-3">Order</th>
                    <th className="px-5 py-3">Method</th>
                    <th className="px-5 py-3 text-right">Amount</th>
                    <th className="px-5 py-3">Status</th>
                    {canManagePayment ? <th className="px-5 py-3"><span className="sr-only">Actions</span></th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--admin-line,var(--color-hairline))]">
                  {result.rows.map((payment) => (
                    <tr key={payment.id} className={tableRow}>
                      <td className="whitespace-nowrap px-5 py-3.5">
                        <Link
                          href={`${adminPath()}/orders/${payment.orderNumber}`}
                          prefetch={false}
                          className="font-semibold text-[var(--color-ink)] hover:text-[var(--color-brand)] hover:underline"
                        >
                          {payment.orderNumber}
                        </Link>
                        <p className="text-xs text-[var(--color-muted-ink)]">{payment.customerName}</p>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5">
                        <p>{PAYMENT_METHOD_LABELS[payment.method]}</p>
                        <p className="text-xs text-[var(--color-muted-ink)]">{payment.locationName ?? "—"}</p>
                      </td>
                      <td className="whitespace-nowrap px-5 py-3.5 text-right font-semibold">{formatMoney(payment.amount, { currency: restaurant.currency })}</td>
                      <td className="whitespace-nowrap px-5 py-3.5">
                        <StatusPill tone={badgeTone(badgeVariant(payment.status))}>{label(payment.status)}</StatusPill>
                        <p className="mt-1 text-xs text-[var(--color-muted-ink)]">{payment.paidAt ? `Paid ${paidAt(payment.paidAt)}` : "Not paid yet"}</p>
                      </td>
                      {canManagePayment ? (
                        <td className="px-5 py-3.5">
                          <div className="flex justify-end">
                            <PaymentStatusControl orderId={payment.orderId} orderNumber={payment.orderNumber} method={payment.method} status={payment.status} size="xs" />
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      <AdminPagination page={pageNum} totalPages={result.totalPages} linkFor={(page) => linkFor({ page })} />
    </>
  );
}

function PaymentsResultsSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading payments">
      <AdminPageHeader title="Payments" description={<Skeleton className="h-4 w-16" />} />
      <AdminTabsSkeleton count={6} />
      <AdminTableSkeleton rows={8} cols={6} />
    </div>
  );
}
