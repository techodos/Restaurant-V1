import { Skeleton } from "@/components/ui/skeleton";

export default function CheckoutLoading() {
  return (
    <div className="container-page py-10 md:py-14">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="mt-3 h-4 w-64" />
      <div className="mt-8 max-w-3xl space-y-6">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-44 rounded-[var(--radius-brand)]" />
        ))}
      </div>
    </div>
  );
}
