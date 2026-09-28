import { MenuGridSkeleton, Skeleton } from "@/components/ui/skeleton";

export default function MenuLoading() {
  return (
    <div className="container-page py-10 md:py-14">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="mt-3 h-4 w-80" />
      <Skeleton className="mt-6 h-11 w-full" />
      <div className="mt-5 flex gap-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-9 w-28 rounded-full" />
        ))}
      </div>
      <div className="mt-10 space-y-3">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="mt-6">
        <MenuGridSkeleton />
      </div>
    </div>
  );
}
