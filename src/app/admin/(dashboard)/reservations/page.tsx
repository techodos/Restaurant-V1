import type { Metadata } from "next";
import { Suspense } from "react";
import { Armchair, CalendarCheck, Users } from "lucide-react";
import { formatDateKey } from "@/shared/hours";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listReservationsForStaff } from "@/server/services/reservations";
import { RESERVATION_STATUS_LABELS, type ReservationStatus } from "@/shared/contract/enums";
import { requireAdminPage } from "@/web/session";
import { getAdminBranchScope } from "@/web/admin";
import { ReservationStatusControl } from "@/components/admin/reservation-status-control";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatusTabs } from "@/components/admin/admin-status-tabs";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { AdminTableSkeleton, AdminTabsSkeleton } from "@/components/admin/admin-skeleton";
import { StatusPill, reservationStatusTone } from "@/components/admin/admin-ui";
import { adminPath, cn } from "@/shared/utils";
import { instanceRestaurantSlug } from "@/web/instance";

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
  searchParams: Promise<{ status?: string; page?: string }>;
}

export default async function AdminReservationsPage({ searchParams }: ReservationsPageProps) {
  const restaurantSlug = instanceRestaurantSlug();
  const actor = await requireAdminPage("reservations.view", restaurantSlug);
  const { status, page } = await searchParams;
  const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
  const canManage = actor.permissions.includes("reservations.manage");

  const activeStatus = (status ?? "upcoming") as "upcoming" | "all" | ReservationStatus;
  const pageNum = Number.parseInt(page ?? "1", 10) || 1;
  // the branch comes from the header's selector (owner/admin) or the member's own branch — never the URL
  const { locationId } = await getAdminBranchScope(restaurantSlug);

  const linkFor = (params: { status?: string; page?: number }) => {
    const search = new URLSearchParams();
    search.set("status", params.status ?? activeStatus);
    if (params.page && params.page > 1) search.set("page", String(params.page));
    return `${adminPath()}/reservations?${search.toString()}`;
  };

  return (
    <div className="space-y-5">
      {/* keyed on the filter/page/branch so a filter change always suspends and shows the skeleton again */}
      <Suspense key={`${activeStatus}:${pageNum}:${locationId ?? "all"}`} fallback={<ReservationsResultsSkeleton />}>
        <ReservationsResults
          ctx={ctx}
          actorRestaurantId={actor.restaurantId}
          activeStatus={activeStatus}
          pageNum={pageNum}
          locationId={locationId}
          canManage={canManage}
          linkFor={linkFor}
        />
      </Suspense>
    </div>
  );
}

async function ReservationsResults({
  ctx,
  actorRestaurantId,
  activeStatus,
  pageNum,
  locationId,
  canManage,
  linkFor,
}: {
  ctx: { restaurantId: string; userId: string; actor: string };
  actorRestaurantId: string;
  activeStatus: "upcoming" | "all" | ReservationStatus;
  pageNum: number;
  locationId: string | null;
  canManage: boolean;
  linkFor: (params: { status?: string; page?: number }) => string;
}) {
  // the staff check already tied this session to this slug's restaurant (actorRestaurantId)
  const result = await listReservationsForStaff(
    actorRestaurantId,
    { status: activeStatus, locationId: locationId ?? undefined, page: pageNum, pageSize: 20 },
    ctx,
  );

  // one section per day, in the order the list comes in (upcoming: soonest first; history: newest first)
  const days: { date: string; rows: typeof result.rows }[] = [];
  for (const reservation of result.rows) {
    const last = days.at(-1);
    if (last && last.date === reservation.reservationDate) last.rows.push(reservation);
    else days.push({ date: reservation.reservationDate, rows: [reservation] });
  }

  return (
    <>
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
              <h2 className="mb-2.5 flex items-baseline gap-2 px-0.5">
                <span className="font-[family-name:var(--font-heading)] text-[1.15rem] font-semibold">
                  {formatDateKey(day.date, undefined, { weekday: "long", day: "numeric", month: "long" })}
                </span>
                <span className="text-[13px] text-[var(--color-muted-ink)]">
                  {day.rows.length} {day.rows.length === 1 ? "booking" : "bookings"}
                </span>
              </h2>
              <Card className="divide-y divide-[var(--admin-line,var(--color-hairline))] overflow-hidden">
                {day.rows.map((reservation) => (
                  <div
                    key={reservation.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-4 transition-colors hover:bg-[color-mix(in_srgb,var(--color-brand)_3.5%,transparent)] sm:px-5"
                  >
                    <p className="grid h-14 w-16 shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--color-brand)_9%,var(--color-surface))] text-center ring-1 ring-inset ring-[color-mix(in_srgb,var(--color-brand)_16%,transparent)]">
                      <span className="tabular text-[17px] font-semibold leading-none text-[var(--color-brand)]">
                        {reservation.reservationTime.slice(0, 5)}
                      </span>
                    </p>
                    <div className="min-w-0 flex-1 basis-[14rem]">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <p className="truncate text-[15px] font-semibold">{reservation.guestName}</p>
                        <StatusPill tone={reservationStatusTone(reservation.status)}>{RESERVATION_STATUS_LABELS[reservation.status]}</StatusPill>
                      </div>
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] text-[var(--color-muted-ink)]">
                        <span className="inline-flex items-center gap-1.5 text-[var(--color-ink)]">
                          <Users className="size-3.5" aria-hidden />
                          {reservation.guests} {reservation.guests === 1 ? "guest" : "guests"}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Armchair className="size-3.5" aria-hidden />
                          {reservation.tableNumber ? `Table ${reservation.tableNumber}` : "No table yet"}
                          {reservation.locationName ? ` · ${reservation.locationName}` : ""}
                        </span>
                        <span className="tabular">{reservation.guestPhone}</span>
                        <span className="tabular">#{reservation.confirmationCode}</span>
                      </p>
                    </div>
                    {canManage ? (
                      <div className="w-full sm:ml-auto sm:w-auto">
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
    </>
  );
}

function ReservationsResultsSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading reservations">
      <AdminPageHeader title="Reservations" description={<Skeleton className="h-4 w-32" />} />
      <AdminTabsSkeleton count={8} />
      <AdminTableSkeleton rows={8} cols={5} />
    </div>
  );
}
