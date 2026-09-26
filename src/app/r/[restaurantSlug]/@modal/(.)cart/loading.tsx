import { Skeleton } from "@/components/ui/skeleton";

export default function TrayDrawerLoading() {
  return (
    <div className="space-y-6 px-5 md:px-7" aria-busy="true" aria-label="Loading your tray">
      <Skeleton className="h-11 w-full rounded-full" />
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-4">
          <Skeleton className="aspect-square w-full rounded-[var(--radius-card)]" />
          <div className="space-y-2 pt-1">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-8 w-28 rounded-full" />
          </div>
        </div>
      ))}
      <Skeleton className="h-40 w-full rounded-[var(--radius-card)]" />
    </div>
  );
}
