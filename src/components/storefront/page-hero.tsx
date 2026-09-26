import Image from "next/image";
import { cn } from "@/shared/utils";

interface PageHeroProps {
  eyebrow?: string | undefined;
  title: string;
  subtitle?: string | undefined;
  /** already-resolved image URL (web/media), or null for a plain night ground */
  image: string | null;
  /** the hero opens the page: it runs under the header, which floats transparent over it */
  overlay: boolean;
  size?: "md" | "sm";
  /** controls set under the heading (search, filters, a summary line) */
  children?: React.ReactNode;
  /** content placed at the right on wide screens (e.g. a rating figure) */
  aside?: React.ReactNode;
  className?: string;
}

/**
 * The opening of a functional page (menu, reservations, reviews, locations, account): the restaurant's
 * own photograph under a night scrim with the page's serif title. Shorter than the home hero; the page's
 * work starts right below it.
 */
export function PageHero({ eyebrow, title, subtitle, image, overlay, size = "md", children, aside, className }: PageHeroProps) {
  return (
    <div data-hero-overlay={overlay || undefined} className={cn(overlay && "-mt-[var(--header-h,4.25rem)]")}>
      <section
        className={cn(
          "tone-night relative isolate overflow-hidden",
          size === "md" ? "min-h-[min(52svh,480px)]" : "min-h-[min(34svh,320px)]",
          className,
        )}
      >
        {image ? (
          <>
            <Image src={image} alt="" fill priority sizes="100vw" className="animate-hero -z-20 object-cover" />
            <span
              aria-hidden
              className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgb(0_0_0/0.55)_0%,rgb(0_0_0/0.35)_40%,rgb(0_0_0/0.8)_100%)]"
            />
          </>
        ) : (
          <span
            aria-hidden
            className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_85%_0%,color-mix(in_srgb,var(--color-brand)_32%,transparent),transparent_60%)]"
          />
        )}
        <div
          className={cn(
            "container-page flex h-full flex-col justify-end pb-8 md:pb-10",
            size === "md" ? "min-h-[min(52svh,480px)]" : "min-h-[min(34svh,320px)]",
            overlay ? "pt-[calc(var(--header-h,4.25rem)+2rem)]" : "pt-10",
          )}
        >
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl text-white">
              {eyebrow ? <p className="eyebrow animate-rise mb-3 text-white/80">{eyebrow}</p> : null}
              <h1 className="display-hero animate-rise text-[clamp(2.6rem,1.6rem+3.6vw,4.9rem)] [animation-delay:80ms]">{title}</h1>
              {subtitle ? (
                <p className="animate-rise mt-3 max-w-[40rem] text-[15.5px] leading-relaxed text-white/80 [animation-delay:160ms] md:text-[17px]">
                  {subtitle}
                </p>
              ) : null}
            </div>
            {aside ? <div className="animate-rise shrink-0 [animation-delay:200ms]">{aside}</div> : null}
          </div>
          {children ? <div className="animate-rise mt-6 [animation-delay:240ms]">{children}</div> : null}
        </div>
      </section>
    </div>
  );
}
