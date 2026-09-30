import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { AdminHeaderSkeleton } from "@/components/admin/admin-skeleton";

export default function OrderDetailLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading order">
      <AdminHeaderSkeleton />
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-28" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-11 w-48" />
        </CardContent>
      </Card>
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardContent className="space-y-3 pt-5">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-4 w-full" />
            ))}
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-2 pt-5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-40" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
