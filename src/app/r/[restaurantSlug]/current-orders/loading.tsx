import { Skeleton } from "@/components/ui/skeleton";

export default function CurrentOrdersLoading() {
  return (
    <div className="container-page py-10 md:py-14" aria-busy="true" aria-label="Loading your current orders">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="mt-3 h-4 w-72 max-w-full" />
      <div className="mt-8 space-y-4">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className="space-y-3 rounded-[var(--radius-brand)] border border-[var(--color-hairline)] p-5">
            <div className="flex justify-between gap-4">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-9 w-32" />
          </div>
        ))}
      </div>
    </div>
  );
}
