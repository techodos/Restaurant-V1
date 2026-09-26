import type { Metadata } from "next";
import Link from "next/link";
import { formatDateKey } from "@/shared/hours";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listReservationsForStaff } from "@/server/services/reservations";
import { RESERVATION_STATUS_LABELS, type ReservationStatus } from "@/shared/contract/enums";
import { cn } from "@/shared/utils";
import { getAdminRestaurant } from "@/web/admin";
import { requirePermission } from "@/web/session";
import { ReservationStatusControl } from "@/components/admin/reservation-status-control";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reservations" };

const TABS: { key: "upcoming" | "all" | ReservationStatus; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "pending", label: "Pending" },
  { key: "confirmed", label: "Confirmed" },
  { key: "seated", label: "Seated" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "no_show", label: "No show" },
  { key: "all", label: "All" },
];

function badgeVariant(status: ReservationStatus): "warning" | "info" | "soft" | "success" | "danger" | "neutral" {
  switch (status) {
    case "pending":
      return "warning";
    case "confirmed":
      return "info";
    case "seated":
      return "soft";
    case "completed":
      return "success";
    case "cancelled":
    case "no_show":
      return "danger";
    default:
      return "neutral";
  }
}

interface ReservationsPageProps {
  searchParams: Promise<{ status?: string; page?: string }>;
}

export default async function AdminReservationsPage({ searchParams }: ReservationsPageProps) {
  const actor = await requirePermission("reservations.view");
  const restaurant = await getAdminRestaurant();
  const { status, page } = await searchParams;
  const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
  const canManage = actor.permissions.includes("reservations.manage");

  const activeStatus = (status ?? "upcoming") as "upcoming" | "all" | ReservationStatus;
  const pageNum = Number.parseInt(page ?? "1", 10) || 1;

  const result = await listReservationsForStaff(restaurant.id, { status: activeStatus, page: pageNum, pageSize: 20 }, ctx);

  const linkFor = (params: { status?: string; page?: number }) => {
    const search = new URLSearchParams();
    search.set("status", params.status ?? activeStatus);
    if (params.page && params.page > 1) search.set("page", String(params.page));
    return `/admin/reservations?${search.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">Reservations</h1>
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
            {tab.label}
          </Link>
        ))}
      </nav>

      <Card className="overflow-hidden">
        {result.rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-[var(--color-muted-ink)]">No reservations match this filter.</p>
        ) : (
          <div className="overflow-x-auto"><table className="tabular w-full min-w-[42rem] text-sm">
            <thead className="border-b border-[var(--color-hairline)] bg-[color-mix(in_srgb,var(--color-ink)_3%,transparent)] text-left text-xs font-medium text-[var(--color-muted-ink)]">
              <tr>
                <th className="px-4 py-3 font-medium">Guest</th>
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Guests</th>
                <th className="px-4 py-3 font-medium">Table / Location</th>
                <th className="px-4 py-3 font-medium">Status</th>
                {canManage ? <th className="px-4 py-3 font-medium">Update</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-hairline)]">
              {result.rows.map((reservation) => (
                <tr key={reservation.id} className="hover:bg-[color-mix(in_srgb,var(--color-ink)_3%,transparent)]">
                  <td className="px-4 py-3">
                    <p className="font-medium">{reservation.guestName}</p>
                    <p className="text-xs text-[var(--color-muted-ink)]">{reservation.guestPhone}</p>
                    <p className="text-xs text-[var(--color-muted-ink)]">#{reservation.confirmationCode}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p>{formatDateKey(reservation.reservationDate, undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</p>
                    <p className="text-xs text-[var(--color-muted-ink)]">{reservation.reservationTime}</p>
                  </td>
                  <td className="px-4 py-3">{reservation.guests}</td>
                  <td className="px-4 py-3 text-[var(--color-muted-ink)]">
                    {reservation.tableNumber ? `Table ${reservation.tableNumber}` : "—"}
                    {reservation.locationName ? ` · ${reservation.locationName}` : ""}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={badgeVariant(reservation.status)}>{RESERVATION_STATUS_LABELS[reservation.status]}</Badge>
                  </td>
                  {canManage ? (
                    <td className="px-4 py-3">
                      <ReservationStatusControl reservationId={reservation.id} currentStatus={reservation.status} />
                    </td>
                  ) : null}
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
