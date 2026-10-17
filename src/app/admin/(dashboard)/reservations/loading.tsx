import { AdminHeaderSkeleton, AdminTabsSkeleton, AdminTableSkeleton } from "@/components/admin/admin-skeleton";

export default function ReservationsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading reservations">
      <AdminHeaderSkeleton />
      <AdminTabsSkeleton count={8} />
      <AdminTableSkeleton rows={8} cols={5} />
    </div>
  );
}
