import { PageHeroSkeleton } from "@/components/storefront/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function LocationsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading our locations">
      <PageHeroSkeleton size="sm" />
      {Array.from({ length: 2 }).map((_, index) => (
        <section key={index} className="container-page section-y grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12">
          <div>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-4 h-9 w-[min(20rem,80%)]" />
            <Skeleton className="mt-4 h-4 w-3/4" />
            <Skeleton className="mt-2 h-4 w-1/2" />
            <div className="mt-6 flex gap-3">
              <Skeleton className="h-12 w-36 rounded-full" />
              <Skeleton className="h-12 w-32 rounded-full" />
            </div>
          </div>
          <div className="space-y-2.5">
            {Array.from({ length: 7 }).map((_, row) => (
              <Skeleton key={row} className="h-5 w-full" />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
