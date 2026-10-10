import { Skeleton } from "@/components/ui/skeleton";

/** A dish opened as its own page (reload / shared link): photo beside the details and the add controls. */
export default function DishLoading() {
  return (
    <div className="container-page py-8 md:py-12" aria-busy="true" aria-label="Loading dish">
      <Skeleton className="h-4 w-40" />
      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12">
        <Skeleton className="aspect-[4/3] w-full rounded-[var(--radius-panel)]" />
        <div>
          <Skeleton className="h-10 w-3/4" />
          <Skeleton className="mt-4 h-6 w-28" />
          <Skeleton className="mt-6 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-5/6" />
          <div className="mt-8 space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-14 w-full rounded-[var(--radius-brand)]" />
            ))}
          </div>
          <Skeleton className="mt-8 h-14 w-full rounded-full" />
        </div>
      </div>
    </div>
  );
}
