import { Skeleton } from "@/components/ui/skeleton";
import { AdminHeaderSkeleton, AdminTableSkeleton } from "@/components/admin/admin-skeleton";

export default function CustomersLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading customers">
      <AdminHeaderSkeleton />
      <Skeleton className="h-11 w-full max-w-md" />
      <AdminTableSkeleton rows={8} cols={4} />
    </div>
  );
}
