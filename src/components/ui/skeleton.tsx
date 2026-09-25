import { cn } from "@/shared/utils";

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block rounded-[calc(var(--radius-brand)/2)] skeleton-shimmer", className)} />;
}

/** Menu-shaped placeholder used by /menu and the home page while data loads. */
export function MenuGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <li key={index} className="surface-flat overflow-hidden">
          <Skeleton className="aspect-4/3 w-full rounded-none" />
          <div className="space-y-3 p-4">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        </li>
      ))}
    </ul>
  );
}
