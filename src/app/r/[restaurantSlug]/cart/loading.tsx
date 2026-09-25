import { Skeleton } from "@/components/ui/skeleton";

export default function CartLoading() {
  return (
    <div className="container-page py-10 md:py-14">
      <Skeleton className="h-9 w-40" />
      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex gap-4 rounded-[var(--radius-brand)] border border-[var(--color-hairline)] p-5">
              <Skeleton className="size-20 rounded-[var(--radius-brand)]" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-9 w-32" />
              </div>
            </div>
          ))}
        </div>
        <Skeleton className="h-80 rounded-[var(--radius-brand)]" />
      </div>
    </div>
  );
}
