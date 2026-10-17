import { Skeleton } from "@/components/ui/skeleton";
import { AdminHeaderSkeleton } from "@/components/admin/admin-skeleton";

export default function LocationsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading locations">
      <AdminHeaderSkeleton />
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-[4.25rem] w-full" />
        ))}
      </div>
    </div>
  );
}
