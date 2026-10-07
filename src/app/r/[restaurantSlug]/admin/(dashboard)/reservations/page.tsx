import type { Metadata } from "next";
import { adminPath } from "@/shared/utils";
import { CalendarCheck } from "lucide-react";
import { formatDateKey } from "@/shared/hours";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { listReservationsForStaff } from "@/server/services/reservations";
import { RESERVATION_STATUS_LABELS, type ReservationStatus } from "@/shared/contract/enums";
import { requireAdminPage } from "@/web/session";
import { getAdminBranchScope } from "@/web/admin";
import { ReservationStatusControl } from "@/components/admin/reservation-status-control";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatusTabs } from "@/components/admin/admin-status-tabs";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminPagination } from "@/components/admin/admin-pagination";

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
  params: Promise<{ restaurantSlug: string }>;
  searchParams: Promise<{ status?: string; page?: string }>;
}

export default async function AdminReservationsPage({ params, searchParams }: ReservationsPageProps) {
  const { restaurantSlug } = await params;
  const actor = await requireAdminPage("reservations.view", restaurantSlug);
  const { status, page } = await searchParams;
  const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
  const canManage = actor.permissions.includes("reservations.manage");

  const activeStatus = (status ?? "upcoming") as "upcoming" | "all" | ReservationStatus;
  const pageNum = Number.parseInt(page ?? "1", 10) || 1;
  // the branch comes from the header's selector (owner/admin) or the member's own branch — never the URL
  const { locationId } = await getAdminBranchScope(restaurantSlug);

  // the staff check already tied this session to this slug's restaurant (actor.restaurantId)
  const result = await listReservationsForStaff(
    actor.restaurantId,
    { status: activeStatus, locationId: locationId ?? undefined, page: pageNum, pageSize: 20 },
    ctx,
  );

  const linkFor = (params: { status?: string; page?: number }) => {
    const search = new URLSearchParams();
    search.set("status", params.status ?? activeStatus);
    if (params.page && params.page > 1) search.set("page", String(params.page));
    return `${adminPath(restaurantSlug)}/reservations?${search.toString()}`;
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Reservations" description={`${result.total} total`} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <AdminStatusTabs options={TABS} active={activeStatus} linkFor={(key) => linkFor({ status: key })} />
      </div>

      <Card className="overflow-hidden">
        {result.rows.length === 0 ? (
          <AdminEmptyState icon={CalendarCheck} title="No reservations match this filter." />
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

      <AdminPagination page={pageNum} totalPages={result.totalPages} linkFor={(page) => linkFor({ page })} />
    </div>
  );
}
