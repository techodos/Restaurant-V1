import { Skeleton } from "@/components/ui/skeleton";
import { AdminHeaderSkeleton } from "@/components/admin/admin-skeleton";

/** Mirrors the kitchen board: four counters, then three lanes of tickets. */
export default function KitchenLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading kitchen">
      <AdminHeaderSkeleton />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="space-y-2 rounded-[var(--radius-card,14px)] border border-[var(--color-hairline)] bg-[var(--color-surface)] px-4 py-3">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-8" />
          </div>
        ))}
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, lane) => (
          <div key={lane} className="space-y-3 rounded-[calc(var(--radius-card,14px)+4px)] bg-[var(--color-canvas-muted)] p-3">
            <Skeleton className="h-4 w-24" />
            {Array.from({ length: lane === 0 ? 2 : 1 }).map((_, index) => (
              <div key={index} className="space-y-3 rounded-[var(--radius-card,14px)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-4">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-3 w-36" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
