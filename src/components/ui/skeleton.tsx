import { cn } from "@/shared/utils";

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("block rounded-[calc(var(--radius-brand)/2)] skeleton-shimmer", className)} />;
}

/** Menu-shaped placeholder: the same plate grid the menu renders, so nothing jumps when data lands. */
export function MenuGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-9 md:grid-cols-3 md:gap-x-6 md:gap-y-12" aria-hidden>
      {Array.from({ length: count }).map((_, index) => (
        <li key={index}>
          <Skeleton className="aspect-square w-full rounded-[var(--radius-card)]" />
          <Skeleton className="mt-3.5 h-4 w-3/4" />
          <Skeleton className="mt-2 h-3 w-full" />
          <Skeleton className="mt-1.5 h-3 w-2/3" />
        </li>
      ))}
    </ul>
  );
}
