import { Skeleton } from "@/components/ui/skeleton";

/** Sign-in / sign-up / Google phone step: the AuthShell split (cover photo + form). */
export default function AccountLoading() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] lg:min-h-[min(calc(100dvh-var(--header-h,4.5rem)),46rem)] lg:grid-cols-2" aria-busy="true">
      <div className="hidden bg-[var(--color-brand-secondary)] lg:block" />
      <div className="flex items-center justify-center px-5 py-10 sm:px-10 lg:py-12">
        <div className="w-full max-w-[26rem]">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="mt-3 h-4 w-64 max-w-full" />
          <Skeleton className="mt-8 h-12 w-full rounded-full" />
          <Skeleton className="mt-6 h-4 w-16" />
          <Skeleton className="mt-2 h-12 w-full" />
          <Skeleton className="mt-4 h-4 w-20" />
          <Skeleton className="mt-2 h-12 w-full" />
          <Skeleton className="mt-6 h-12 w-full rounded-full" />
        </div>
      </div>
    </div>
  );
}
