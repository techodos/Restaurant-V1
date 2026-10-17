import type { Metadata } from "next";
import { Armchair, CalendarCheck, Users } from "lucide-react";
import { formatDateKey } from "@/shared/hours";
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
import { StatusPill, reservationStatusTone } from "@/components/admin/admin-ui";
import { adminPath, cn } from "@/shared/utils";

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

  // one section per day, in the order the list comes in (upcoming: soonest first; history: newest first)
  const days: { date: string; rows: typeof result.rows }[] = [];
  for (const reservation of result.rows) {
    const last = days.at(-1);
    if (last && last.date === reservation.reservationDate) last.rows.push(reservation);
    else days.push({ date: reservation.reservationDate, rows: [reservation] });
  }

  return (
    <div className="space-y-5">
      <AdminPageHeader title="Reservations" description={`${result.total} ${result.total === 1 ? "booking" : "bookings"}, grouped by day`} />

      <AdminStatusTabs label="Reservation status" options={TABS} active={activeStatus} linkFor={(key) => linkFor({ status: key })} />

      {result.rows.length === 0 ? (
        <Card>
          <AdminEmptyState icon={CalendarCheck} title="No reservations match this filter." />
        </Card>
      ) : (
        <div className="space-y-5">
          {days.map((day) => (
            <section key={day.date} aria-label={formatDateKey(day.date, undefined, { weekday: "long", day: "numeric", month: "long" })}>
              <h2 className="mb-2 px-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted-ink)]">
                {formatDateKey(day.date, undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                <span className="ml-2 font-medium normal-case tracking-normal">
                  · {day.rows.length} {day.rows.length === 1 ? "booking" : "bookings"}
                </span>
              </h2>
              <Card className="divide-y divide-[var(--color-hairline)] overflow-hidden">
                {day.rows.map((reservation) => (
                  <div
                    key={reservation.id}
                    className={cn(
                      "grid items-center gap-x-4 gap-y-2 px-4 py-3.5 transition-colors hover:bg-[color-mix(in_srgb,var(--color-ink)_2.5%,transparent)]",
                      canManage ? "grid-cols-[4rem_1fr] md:grid-cols-[4rem_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_8rem_auto]" : "grid-cols-[4rem_1fr] md:grid-cols-[4rem_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_8rem]",
                    )}
                  >
                    <p className="tabular text-[15px] font-semibold">{reservation.reservationTime.slice(0, 5)}</p>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{reservation.guestName}</p>
                      <p className="truncate text-xs text-[var(--color-muted-ink)]">
                        {reservation.guestPhone} · #{reservation.confirmationCode}
                      </p>
                    </div>
                    <p className="col-start-2 flex items-center gap-1.5 text-sm md:col-start-auto">
                      <Users className="size-4 text-[var(--color-muted-ink)]" aria-hidden />
                      {reservation.guests} {reservation.guests === 1 ? "guest" : "guests"}
                    </p>
                    <p className="col-start-2 flex min-w-0 items-center gap-1.5 text-sm md:col-start-auto">
                      <Armchair className="size-4 shrink-0 text-[var(--color-muted-ink)]" aria-hidden />
                      <span className={cn("truncate", reservation.tableNumber ? "" : "text-[var(--color-muted-ink)]")}>
                        {reservation.tableNumber ? `Table ${reservation.tableNumber}` : "No table yet"}
                        {reservation.locationName ? <span className="text-[var(--color-muted-ink)]"> · {reservation.locationName}</span> : null}
                      </span>
                    </p>
                    <div className="col-start-2 md:col-start-auto">
                      <StatusPill tone={reservationStatusTone(reservation.status)}>{RESERVATION_STATUS_LABELS[reservation.status]}</StatusPill>
                    </div>
                    {canManage ? (
                      <div className="col-start-2 md:col-start-auto md:justify-self-end">
                        <ReservationStatusControl reservationId={reservation.id} currentStatus={reservation.status} />
                      </div>
                    ) : null}
                  </div>
                ))}
              </Card>
            </section>
          ))}
        </div>
      )}

      <AdminPagination page={pageNum} totalPages={result.totalPages} total={result.total} pageSize={20} linkFor={(page) => linkFor({ page })} />
    </div>
  );
}
