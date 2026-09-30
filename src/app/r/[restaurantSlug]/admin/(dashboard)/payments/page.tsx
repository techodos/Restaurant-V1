import type { Metadata } from "next";
import { adminPath } from "@/shared/utils";
import Link from "next/link";
import { CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { listPaymentsForAdmin } from "@/server/services/payments";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUSES, type PaymentStatus } from "@/shared/contract/enums";
import { formatMoney } from "@/shared/money";
import { getAdminRestaurant } from "@/web/admin";
import { requirePermission } from "@/web/session";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatusTabs } from "@/components/admin/admin-status-tabs";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminPagination } from "@/components/admin/admin-pagination";

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
  const actor = await requirePermission("payments.view", restaurantSlug);
  const restaurant = await getAdminRestaurant(restaurantSlug);
  const { status, page } = await searchParams;
  const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };

  const activeStatus = (status ?? "all") as "all" | PaymentStatus;
  const pageNum = Number.parseInt(page ?? "1", 10) || 1;

  const result = await listPaymentsForAdmin(restaurant.id, { status: activeStatus, page: pageNum, pageSize: 20 }, ctx);

  const linkFor = (params: { status?: string; page?: number }) => {
    const search = new URLSearchParams();
    search.set("status", params.status ?? activeStatus);
    if (params.page && params.page > 1) search.set("page", String(params.page));
    return `${adminPath(restaurantSlug)}/payments?${search.toString()}`;
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Payments" description={`${result.total} total`} />

      <AdminStatusTabs
        options={(["all", ...PAYMENT_STATUSES] as const).map((option) => ({ key: option, label: label(option) }))}
        active={activeStatus}
        linkFor={(key) => linkFor({ status: key })}
      />

      <Card className="overflow-hidden">
        {result.rows.length === 0 ? (
          <AdminEmptyState icon={CreditCard} title="No payments match this filter." />
        ) : (
          <div className="overflow-x-auto"><table className="tabular w-full min-w-[42rem] text-sm">
            <thead className="border-b border-[var(--color-hairline)] bg-[color-mix(in_srgb,var(--color-ink)_3%,transparent)] text-left text-xs font-medium text-[var(--color-muted-ink)]">
              <tr>
                <th className="px-4 py-3 font-medium">Order</th>
                <th className="px-4 py-3 font-medium">Customer</th>
                <th className="px-4 py-3 font-medium">Method</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Paid at</th>
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
                  <td className="px-4 py-3">{PAYMENT_METHOD_LABELS[payment.method]}</td>
                  <td className="px-4 py-3 font-medium">{formatMoney(payment.amount, { currency: restaurant.currency })}</td>
                  <td className="px-4 py-3">
                    <Badge variant={badgeVariant(payment.status)}>{label(payment.status)}</Badge>
                  </td>
                  <td className="px-4 py-3 text-[var(--color-muted-ink)]">
                    {payment.paidAt
                      ? new Date(payment.paidAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
                      : "—"}
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
