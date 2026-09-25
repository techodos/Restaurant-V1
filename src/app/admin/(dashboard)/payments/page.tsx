import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listPaymentsForAdmin } from "@/server/services/payments";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUSES, type PaymentStatus } from "@/shared/contract/enums";
import { formatMoney } from "@/shared/money";
import { cn } from "@/shared/utils";
import { getAdminRestaurant } from "@/web/admin";
import { requirePermission } from "@/web/session";

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
  const actor = await requirePermission("payments.view");
  const restaurant = await getAdminRestaurant();
  const { status, page } = await searchParams;
  const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };

  const activeStatus = (status ?? "all") as "all" | PaymentStatus;
  const pageNum = Number.parseInt(page ?? "1", 10) || 1;

  const result = await listPaymentsForAdmin(restaurant.id, { status: activeStatus, page: pageNum, pageSize: 20 }, ctx);

  const linkFor = (params: { status?: string; page?: number }) => {
    const search = new URLSearchParams();
    search.set("status", params.status ?? activeStatus);
    if (params.page && params.page > 1) search.set("page", String(params.page));
    return `/admin/payments?${search.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">Payments</h1>
        <p className="mt-1 text-[var(--color-muted-ink)]">{result.total} total</p>
      </div>

      <nav className="-mx-1 flex snap-x gap-2 overflow-x-auto pb-1">
        {(["all", ...PAYMENT_STATUSES] as const).map((option) => (
          <Link
            key={option}
            href={linkFor({ status: option })}
            className={cn(
              "snap-start whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm transition-colors",
              activeStatus === option
                ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-[var(--color-brand-foreground)]"
                : "border-[var(--color-hairline)] bg-[var(--color-surface)] hover:border-[var(--color-brand)]",
            )}
          >
            {label(option)}
          </Link>
        ))}
      </nav>

      <Card className="overflow-hidden">
        {result.rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-[var(--color-muted-ink)]">No payments match this filter.</p>
        ) : (
          <table className="tabular w-full text-sm">
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
                    <Link href={`/admin/orders/${payment.orderNumber}`} className="font-medium text-[var(--color-brand)] hover:underline">
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
          </table>
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
