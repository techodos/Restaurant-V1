import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

export default function DashboardLoading() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading dashboard">
      <section className="tone-night rounded-[var(--radius-panel)] p-6 md:p-8">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="mt-3 h-9 w-40" />
        <Skeleton className="mt-3 h-4 w-72" />
        <div className="mt-8 grid grid-cols-5 gap-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-24 rounded-[var(--radius-card)]" />
          ))}
        </div>
      </section>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <div className="border-b border-[var(--color-hairline)] px-5 py-4">
            <Skeleton className="h-4 w-32" />
          </div>
          <div className="divide-y divide-[var(--color-hairline)]">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="px-5 py-3.5">
                <Skeleton className="h-4 w-full max-w-sm" />
              </div>
            ))}
          </div>
        </Card>
        <div className="space-y-6">
          <Card className="overflow-hidden">
            <div className="border-b border-[var(--color-hairline)] px-5 py-4">
              <Skeleton className="h-4 w-40" />
            </div>
            <div className="space-y-3 p-5">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
