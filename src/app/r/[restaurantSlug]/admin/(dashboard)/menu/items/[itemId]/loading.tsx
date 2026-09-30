import { Skeleton } from "@/components/ui/skeleton";
import { AdminHeaderSkeleton } from "@/components/admin/admin-skeleton";

export default function EditMenuItemLoading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading item">
      <AdminHeaderSkeleton />
      <div className="space-y-3">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      <div>
        <Skeleton className="mb-3 h-5 w-20" />
        <Skeleton className="h-16 w-full" />
      </div>
      <div>
        <Skeleton className="mb-3 h-5 w-28" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  );
}
