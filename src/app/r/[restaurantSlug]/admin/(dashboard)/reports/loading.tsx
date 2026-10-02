import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { AdminHeaderSkeleton, AdminStatSkeleton, AdminTabsSkeleton } from "@/components/admin/admin-skeleton";

export default function ReportsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading sales reports">
      <AdminHeaderSkeleton />
      <AdminTabsSkeleton count={6} />
      <AdminStatSkeleton count={5} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card className="p-6"><Skeleton className="h-[260px] w-full" /></Card>
        <Card className="p-6"><Skeleton className="h-[260px] w-full" /></Card>
      </div>
    </div>
  );
}
