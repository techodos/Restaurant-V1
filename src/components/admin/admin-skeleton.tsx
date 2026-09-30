import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

/** The page-header placeholder every admin `loading.tsx` opens with: matches AdminPageHeader's layout. */
export function AdminHeaderSkeleton() {
  return (
    <div>
      <Skeleton className="h-[1.375rem] w-40" />
      <Skeleton className="mt-2.5 h-4 w-24" />
    </div>
  );
}

/** The filter-pill row placeholder (orders / menu / payments / reservations / reviews). */
export function AdminTabsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="flex gap-2">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="h-[2.125rem] w-20 rounded-full" />
      ))}
    </div>
  );
}

/**
 * A table-shaped placeholder: same card, header bar and row height as the real table, so nothing jumps
 * into place once the data lands.
 */
export function AdminTableSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-[var(--color-hairline)] bg-[color-mix(in_srgb,var(--color-ink)_3%,transparent)] px-4 py-3">
        <Skeleton className="h-3 w-full max-w-64" />
      </div>
      <div className="divide-y divide-[var(--color-hairline)]">
        {Array.from({ length: rows }).map((_, row) => (
          <div key={row} className="flex items-center gap-6 px-4 py-3.5">
            {Array.from({ length: cols }).map((_, col) => (
              <Skeleton key={col} className={col === 0 ? "h-4 w-32" : "h-4 flex-1"} />
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}

/** A grid of stat-card placeholders (customer detail, dashboard-style summaries). */
export function AdminStatSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index}>
          <div className="space-y-2 p-5">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-20" />
          </div>
        </Card>
      ))}
    </div>
  );
}

/** A stack of card placeholders (reviews list, kitchen board). */
export function AdminCardListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, index) => (
        <Card key={index} className="p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="mt-3 h-4 w-3/4" />
          <Skeleton className="mt-2 h-3 w-1/2" />
        </Card>
      ))}
    </div>
  );
}
