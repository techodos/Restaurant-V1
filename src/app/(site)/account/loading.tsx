import { Skeleton } from "@/components/ui/skeleton";

/** Sign-in / sign-up / Google phone step: the AuthShell outline (night band / split card + form). */
export default function AccountLoading() {
  return (
    <div className="pb-6 md:pb-16 lg:px-6 lg:py-14 xl:py-16" aria-busy="true">
      <div className="lg:mx-auto lg:flex lg:max-w-[1080px] lg:overflow-hidden lg:rounded-[28px] lg:border lg:border-[var(--color-hairline)]">
        <div className="min-h-[248px] bg-[var(--color-night)] md:min-h-[272px] lg:min-h-[600px] lg:flex-[1_1_46%]" />
        <div className="relative -mt-[30px] rounded-t-[28px] bg-[var(--color-canvas)] px-6 py-[26px] md:mx-auto md:max-w-[440px] md:rounded-[28px] md:px-8 md:py-8 lg:mx-0 lg:mt-0 lg:flex lg:max-w-none lg:flex-[1_1_54%] lg:flex-col lg:justify-center lg:rounded-none lg:px-14">
          <div className="lg:mx-auto lg:w-full lg:max-w-[400px]">
            <Skeleton className="mb-7 hidden h-11 w-40 lg:block" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="mt-2 h-[54px] w-full rounded-[14px]" />
            <Skeleton className="mt-4 h-4 w-20" />
            <Skeleton className="mt-2 h-[54px] w-full rounded-[14px]" />
            <Skeleton className="mt-6 h-14 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
