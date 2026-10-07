import { Skeleton } from "@/components/ui/skeleton";

export default function CheckoutLoading() {
  return (
    <div>
      <div className="container-page pb-12 pt-6 md:pb-20 md:pt-10">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="mt-5 h-12 w-56" />
        <Skeleton className="mt-3 h-4 w-72 max-w-full" />
        <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-6 md:mt-10 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:gap-10 xl:gap-12">
          <div className="space-y-6">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-48 rounded-[var(--radius-card)]" />
            ))}
          </div>
          <Skeleton className="h-[28rem] rounded-[var(--radius-panel)]" />
        </div>
      </div>
    </div>
  );
}
