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
 * Sign-in / sign-up / Google phone step: the restaurant's own cover photo and name on one side (from the
 * database, nothing hardcoded), the form on the other. Phones show the form alone.
 */
export function AuthShell({ context, title, description, children }: AuthShellProps) {
  const { restaurant } = context;
  const cover = resolveImage(restaurant.coverUrl);

  return (
    <div className="container-page py-8 md:py-14">
      <div className="surface-card mx-auto grid max-w-5xl overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        <div className="relative isolate hidden min-h-[36rem] flex-col justify-end bg-[var(--color-brand-secondary)] p-10 text-white lg:flex">
          {cover ? (
            <>
              <Image src={cover} alt="" fill sizes="480px" className="-z-20 object-cover" />
              <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/35 to-black/10" />
            </>
          ) : null}
          <p className="font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight tracking-[-0.02em]">
            {restaurant.name}
          </p>
          {restaurant.shortDescription ? (
            <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-white/80">{restaurant.shortDescription}</p>
          ) : null}
        </div>

        <div className="flex flex-col justify-center p-6 sm:p-10 lg:p-12">
          <h1 className="text-[2rem] font-semibold leading-tight">{title}</h1>
          {description ? <p className="mt-2 text-[15px] text-[var(--color-muted-ink)]">{description}</p> : null}
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
