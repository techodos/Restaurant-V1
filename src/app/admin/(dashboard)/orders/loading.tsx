import { Skeleton } from "@/components/ui/skeleton";
import { AdminHeaderSkeleton, AdminTabsSkeleton, AdminTableSkeleton } from "@/components/admin/admin-skeleton";

export default function OrdersLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading orders">
      <AdminHeaderSkeleton />
      <AdminTabsSkeleton count={9} />
      <Skeleton className="h-11 w-full max-w-md" />
      <AdminTableSkeleton rows={8} cols={6} />
    </div>
  );
}
