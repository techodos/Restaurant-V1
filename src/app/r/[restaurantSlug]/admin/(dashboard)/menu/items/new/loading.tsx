import { Skeleton } from "@/components/ui/skeleton";
import { AdminHeaderSkeleton } from "@/components/admin/admin-skeleton";

export default function NewMenuItemLoading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading">
      <AdminHeaderSkeleton />
      <div className="space-y-3">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}
