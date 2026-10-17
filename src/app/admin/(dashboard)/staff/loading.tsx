import { Skeleton } from "@/components/ui/skeleton";
import { AdminHeaderSkeleton } from "@/components/admin/admin-skeleton";

export default function StaffLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading staff">
      <AdminHeaderSkeleton />
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}
