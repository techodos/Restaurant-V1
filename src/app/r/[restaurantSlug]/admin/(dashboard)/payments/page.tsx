import type { Metadata } from "next";
import { adminPath } from "@/shared/utils";
import Link from "next/link";
import { CreditCard } from "lucide-react";
import { Card } from "@/components/ui/card";
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
import { StatusPill, badgeTone, tableHead } from "@/components/admin/admin-ui";

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
  params: Promise<{ restaurantSlug: string }>;
  searchParams: Promise<{ status?: string; page?: string }>;
}

export default async function AdminPaymentsPage({ params, searchParams }: PaymentsPageProps) {
  const { restaurantSlug } = await params;
  const actor = await requireAdminPage("payments.view", restaurantSlug);
  const canManagePayment = actor.permissions.includes("orders.manage");
  const restaurant = await getAdminRestaurant(restaurantSlug);
  const { status, page } = await searchParams;
  const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };

  const activeStatus = (status ?? "all") as "all" | PaymentStatus;
  const pageNum = Number.parseInt(page ?? "1", 10) || 1;
  // the branch comes from the header's selector (owner/admin) or the member's own branch — never the URL
  const { locationId } = await getAdminBranchScope(restaurantSlug);

  const result = await listPaymentsForAdmin(
    restaurant.id,
    { status: activeStatus, locationId: locationId ?? undefined, page: pageNum, pageSize: 20 },
    ctx,
  );

  const linkFor = (params: { status?: string; page?: number }) => {
    const search = new URLSearchParams();
    search.set("status", params.status ?? activeStatus);
    if (params.page && params.page > 1) search.set("page", String(params.page));
    return `${adminPath(restaurantSlug)}/payments?${search.toString()}`;
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Payments" description={`${result.total} total`} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <AdminStatusTabs
          options={(["all", ...PAYMENT_STATUSES] as const).map((option) => ({ key: option, label: label(option) }))}
          active={activeStatus}
          linkFor={(key) => linkFor({ status: key })}
        />
      </div>

      <Card className="overflow-hidden">
        {result.rows.length === 0 ? (
          <AdminEmptyState icon={CreditCard} title="No payments match this filter." />
        ) : (
          <div className="overflow-x-auto"><table className="tabular w-full min-w-[42rem] text-sm">
            <thead className={tableHead}>
              <tr>
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Branch</th>
                <th className="px-4 py-3 font-medium">Method</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Paid at</th>
                {canManagePayment ? <th className="px-4 py-3 font-medium"><span className="sr-only">Actions</span></th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-hairline)]">
              {result.rows.map((payment) => (
                <tr key={payment.id} className="hover:bg-[color-mix(in_srgb,var(--color-ink)_3%,transparent)]">
                  <td className="px-4 py-3">
                    <Link href={`${adminPath(restaurantSlug)}/orders/${payment.orderNumber}`} className="font-medium text-[var(--color-brand)] hover:underline">
                      {payment.orderNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{payment.customerName}</td>
                  <td className="px-4 py-3 text-[var(--color-muted-ink)]">{payment.locationName ?? "—"}</td>
                  <td className="px-4 py-3">{PAYMENT_METHOD_LABELS[payment.method]}</td>
                  <td className="px-4 py-3 font-medium">{formatMoney(payment.amount, { currency: restaurant.currency })}</td>
                  <td className="px-4 py-3">
                    <StatusPill tone={badgeTone(badgeVariant(payment.status))}>{label(payment.status)}</StatusPill>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-muted-ink)]">
                    {payment.paidAt
                      ? new Date(payment.paidAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                      : "—"}
                  </td>
                  {canManagePayment ? (
                    <td className="px-4 py-3">
                      <div className="flex justify-end">
                        <PaymentStatusControl orderId={payment.orderId} orderNumber={payment.orderNumber} method={payment.method} status={payment.status} size="xs" />
                      </div>
                    </td>
                  ) : null}
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
