import { PageHeroSkeleton } from "@/components/storefront/page-skeletons";
import { MenuGridSkeleton, Skeleton } from "@/components/ui/skeleton";

/**
 * Home page: the photo hero, then a dishes section. Lives in the (home) route group so it shows only for the
 * home page; a loading.tsx beside (site)/layout.tsx would also stand in for every page without its own.
 */
export default function HomeLoading() {
  return (
    <div aria-busy="true">
      <PageHeroSkeleton size="full" />
      <div className="container-page section-y">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-4 h-8 w-[min(22rem,80%)]" />
        <div className="section-body">
          <MenuGridSkeleton count={3} />
        </div>
      </div>
    </div>
  );
}
