import { Skeleton } from "@/components/ui/skeleton";

/** Order tracking: the night "live pass" band (status headline + stations), then the order details. */
export default function OrderLoading() {
  return (
    <div aria-busy="true" aria-label="Loading your order">
      <section className="tone-night relative isolate overflow-hidden">
        <div className="container-page pb-10 pt-8 md:pb-12 md:pt-10">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="mt-6 h-12 w-[min(26rem,85%)]" />
          <Skeleton className="mt-4 h-4 w-[min(30rem,90%)]" />
          <div className="mt-8 grid grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-2 w-full rounded-full" />
            ))}
          </div>
        </div>
      </section>
      <div className="container-page mt-10 grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-12">
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full rounded-[var(--radius-brand)]" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-[var(--radius-card)]" />
      </div>
    </div>
  );
}
