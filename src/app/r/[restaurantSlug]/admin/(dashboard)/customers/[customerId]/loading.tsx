import { AdminHeaderSkeleton, AdminStatSkeleton, AdminTableSkeleton } from "@/components/admin/admin-skeleton";

export default function CustomerDetailLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading customer">
      <AdminHeaderSkeleton />
      <AdminStatSkeleton count={4} />
      <AdminTableSkeleton rows={5} cols={4} />
    </div>
  );
}
