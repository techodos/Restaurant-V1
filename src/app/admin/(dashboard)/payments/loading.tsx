import { AdminHeaderSkeleton, AdminTabsSkeleton, AdminTableSkeleton } from "@/components/admin/admin-skeleton";

export default function PaymentsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading payments">
      <AdminHeaderSkeleton />
      <AdminTabsSkeleton count={6} />
      <AdminTableSkeleton rows={8} cols={6} />
    </div>
  );
}
