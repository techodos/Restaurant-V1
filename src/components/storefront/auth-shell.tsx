import Image from "next/image";
import type { StorefrontContext } from "@/shared/contract/models";
import { resolveImage } from "@/web/media";

interface AuthShellProps {
  context: StorefrontContext;
  title: string;
  description?: string;
  children: React.ReactNode;
}

/**
 * Sign-in / sign-up / Google phone step. Desktop: the restaurant's own cover photograph fills the left
 * half edge to edge with its name and line; the form sits alone on the right. Phones: the form alone.
 * Everything shown about the restaurant comes from the database.
 */
export function AuthShell({ context, title, description, children }: AuthShellProps) {
  const { restaurant } = context;
  const cover = resolveImage(restaurant.coverUrl);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] lg:min-h-[min(calc(100dvh-var(--header-h,4.5rem)),46rem)] lg:grid-cols-2">
      <div className="relative isolate hidden flex-col justify-end overflow-hidden bg-[var(--color-brand-secondary)] p-10 text-white lg:flex">
        {cover ? (
          <>
            <Image src={cover} alt="" fill sizes="50vw" className="animate-hero -z-20 object-cover" />
            <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/25 to-black/5" />
          </>
        ) : null}
        <p className="font-[family-name:var(--font-display)] text-5xl font-semibold leading-[1] tracking-[-0.02em]">{restaurant.name}</p>
        {restaurant.shortDescription ? (
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/80">{restaurant.shortDescription}</p>
        ) : null}
      </div>

      <div className="flex items-center justify-center px-5 py-10 sm:px-10 lg:py-12">
        <div className="w-full max-w-[26rem] animate-rise">
          <h1 className="display-1">{title}</h1>
          {description ? <p className="mt-3 text-[15px] leading-relaxed text-[var(--color-muted-ink)]">{description}</p> : null}
          <div className="mt-7">{children}</div>
        </div>
      </div>
    </div>
  );
}
