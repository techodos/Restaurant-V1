import { ReservationFormSkeleton } from "@/components/storefront/page-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Booking page: the night photo panel beside the form, same split as reservation/page.tsx. */
export default function ReservationLoading() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" aria-busy="true">
      <aside className="tone-night relative isolate overflow-hidden lg:sticky lg:top-[var(--header-h,4.5rem)] lg:h-[calc(100svh-var(--header-h,4.5rem))]">
        <div className="flex h-full min-h-[18rem] flex-col justify-end px-5 pb-8 pt-16 md:px-10 lg:px-12 lg:pb-10">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-4 h-10 w-[min(22rem,85%)]" />
          <Skeleton className="mt-4 h-4 w-[min(26rem,90%)]" />
        </div>
      </aside>
      <ReservationFormSkeleton />
    </div>
  );
}
