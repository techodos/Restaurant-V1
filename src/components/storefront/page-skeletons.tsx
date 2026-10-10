import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/shared/utils";

/**
 * Route-level loading states for the storefront (`loading.tsx`). Next prefetches these with every link, so a
 * click shows the next page's shape at once instead of leaving the old page on screen until the server is done.
 * Each mirrors its page's real layout (same heights, same grid) so nothing jumps when the content lands.
 */

const HERO_HEIGHT = {
  full: "min-h-[min(100svh,900px)]",
  md: "min-h-[min(52svh,480px)]",
  sm: "min-h-[min(34svh,320px)]",
} as const;

/** The night photo band functional pages open with (PageHero), running under the transparent header. */
export function PageHeroSkeleton({ size = "sm" }: { size?: keyof typeof HERO_HEIGHT }) {
  return (
    <div className="-mt-[var(--header-h,4.25rem)]">
      <section className={cn("tone-night relative isolate overflow-hidden", HERO_HEIGHT[size])}>
        <div
          className={cn(
            "container-page flex h-full flex-col justify-end pb-8 pt-[calc(var(--header-h,4.25rem)+2rem)] md:pb-10",
            HERO_HEIGHT[size],
          )}
        >
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-4 h-10 w-[min(28rem,80%)] md:h-12" />
          <Skeleton className="mt-4 h-4 w-[min(34rem,90%)]" />
        </div>
      </section>
    </div>
  );
}

/** The booking form's column: numbered steps (label left, controls right from md), as ReservationForm lays them out. */
export function ReservationFormSkeleton() {
  const step = (controls: React.ReactNode) => (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 border-t border-[var(--rule)] pt-7 md:grid-cols-[10rem_minmax(0,1fr)] md:gap-8">
      <div>
        <Skeleton className="h-7 w-8" />
        <Skeleton className="mt-2 h-3 w-14" />
      </div>
      <div>{controls}</div>
    </div>
  );
  return (
    <div className="px-5 py-10 md:px-10 md:py-12 lg:px-14 xl:px-20" aria-busy="true" aria-label="Loading available tables">
      <div className="mx-auto max-w-[46rem] space-y-10">
        {step(
          <>
            <Skeleton className="h-4 w-20" />
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Skeleton className="h-16 rounded-[var(--radius-brand)]" />
              <Skeleton className="h-16 rounded-[var(--radius-brand)]" />
            </div>
            <Skeleton className="mt-6 h-4 w-12" />
            <div className="mt-3 flex gap-2 overflow-hidden">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-[5.25rem] w-[4.25rem] shrink-0 rounded-[var(--radius-brand)]" />
              ))}
            </div>
            <Skeleton className="mt-6 h-4 w-14" />
            <Skeleton className="mt-3 h-12 w-36 rounded-full" />
          </>,
        )}
        {step(
          <>
            <Skeleton className="h-3 w-16" />
            <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6 xl:grid-cols-7">
              {Array.from({ length: 14 }).map((_, index) => (
                <Skeleton key={index} className="h-10 rounded-full" />
              ))}
            </div>
          </>,
        )}
      </div>
    </div>
  );
}

/** A plain column of text blocks (website pages, review lists). */
export function SectionBlocksSkeleton({ blocks = 3 }: { blocks?: number }) {
  return (
    <div className="container-page section-y space-y-10">
      {Array.from({ length: blocks }).map((_, index) => (
        <div key={index}>
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-4 h-8 w-[min(24rem,80%)]" />
          <Skeleton className="mt-4 h-4 w-full max-w-[40rem]" />
          <Skeleton className="mt-2 h-4 w-[85%] max-w-[36rem]" />
        </div>
      ))}
    </div>
  );
}
