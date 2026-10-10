import { PageHeroSkeleton } from "@/components/storefront/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function ReviewsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading reviews">
      <PageHeroSkeleton size="sm" />
      <div className="container-page section-y grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="space-y-3 rounded-[var(--radius-card)] border border-[var(--color-hairline)] p-6">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-3 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}
