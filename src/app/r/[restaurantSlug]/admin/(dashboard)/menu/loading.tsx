import { Skeleton } from "@/components/ui/skeleton";
import { AdminHeaderSkeleton, AdminTabsSkeleton, AdminTableSkeleton } from "@/components/admin/admin-skeleton";

export default function MenuLoading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading menu">
      <AdminHeaderSkeleton />
      <section>
        <Skeleton className="mb-3 h-5 w-24" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-7 w-24 rounded-full" />
          ))}
        </div>
      </section>
      <section>
        <Skeleton className="mb-3 h-5 w-16" />
        <div className="mb-4">
          <AdminTabsSkeleton count={5} />
        </div>
        <AdminTableSkeleton rows={8} cols={4} />
      </section>
    </div>
  );
}
