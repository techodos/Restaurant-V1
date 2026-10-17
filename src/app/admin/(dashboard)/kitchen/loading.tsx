import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { AdminHeaderSkeleton } from "@/components/admin/admin-skeleton";

export default function KitchenLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading kitchen">
      <AdminHeaderSkeleton />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={index}>
            <div className="space-y-3 p-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
