import Link from "next/link";
import { ArrowRight, CalendarDays, MapPin } from "lucide-react";
import type { StorefrontContext } from "@/shared/contract/models";
import type { HeroSection as HeroSectionConfig } from "@/shared/contract/sections";
import { resolveImage } from "@/web/media";
import { cn } from "@/shared/utils";
import { CtaLink } from "@/components/storefront/cta-link";
import { serviceStatus } from "@/components/storefront/service-status";
import { HeroStage } from "./hero-stage";

const HEIGHTS: Record<string, string> = {
  sm: "min-h-[min(60svh,560px)]",
  md: "min-h-[min(80svh,720px)]",
  lg: "min-h-[min(92svh,860px)] md:min-h-[100svh]",
  full: "min-h-[100svh]",
};

const STATUS_DOT = {
  open: "bg-[var(--color-success)]",
  closing: "bg-[var(--color-warning)]",
  closed: "bg-white/45",
} as const;

/**
 * The hero for the 3D template (TEMPLATE_ID=2). Same content as the Classic hero (eyebrow, title,
 * subtitle, both buttons, the live opening line and highlights, all from the database); the presentation
 * changes: the brand colours as a lit stage with a perspective floor, a live 3D model beside the headline
 * (hero-stage.tsx, client-only), and the highlights running as a tilted sticker band.
 */
export function Hero3DSection({ section, context }: { section: HeroSectionConfig; context: StorefrontContext }) {
  const poster = resolveImage(section.image?.url) ?? resolveImage(context.restaurant.coverUrl);
  const centered = section.alignment === "center";
  const location = context.primaryLocation;
  const status = location ? serviceStatus(location.hours, new Date(), context.restaurant.timezone) : null;
  const secondary = section.secondaryCta;
  const { primary, accent } = context.theme;

  return (
    <section
      className={cn("tone-night relative isolate flex flex-col overflow-hidden", HEIGHTS[section.height] ?? HEIGHTS.lg)}
      style={{
        background: `radial-gradient(60% 70% at 72% 42%, color-mix(in srgb, ${primary} 62%, transparent), transparent 70%), radial-gradient(45% 55% at 12% 88%, color-mix(in srgb, ${accent} 30%, transparent), transparent 70%), var(--color-night)`,
      }}
    >
      {/* perspective floor: a grid laid back into the distance, drifting toward the viewer */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-[46%] [perspective:520px] [mask-image:linear-gradient(to_top,black_10%,transparent_95%)]">
        <div className="depth-floor absolute inset-x-[-50%] bottom-[-10%] top-0 origin-bottom [transform:rotateX(62deg)]" />
      </div>

      <div
        className={cn(
          "container-page grid w-full flex-1 grid-cols-[minmax(0,1fr)] items-center gap-6 pb-10 pt-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-10 lg:pb-14",
          "[[data-hero-overlay]_&]:pt-[calc(var(--header-h,4.25rem)+1rem)] lg:[[data-hero-overlay]_&]:pt-[calc(var(--header-h,4.25rem)+2rem)]",
        )}
      >
        {/* on phones the model comes first: it is the first thing a visitor should see */}
        <div className="order-first mx-auto w-full max-w-[min(26rem,78vw)] lg:order-last lg:max-w-[38rem]">
          <HeroStage
            poster={poster}
            posterAlt={section.image?.alt ?? ""}
            modelUrl={section.modelUrl ?? null}
            brand={primary}
            accent={accent}
            label={section.modelUrl ? `${context.restaurant.name}, in 3D` : "A burger, turning in 3D"}
          />
        </div>

        <div className={cn("max-w-[40rem]", centered && "mx-auto text-center lg:mx-0 lg:text-left")}>
          {section.eyebrow ? (
            <p className="animate-rise mb-4 inline-flex -rotate-2 items-center rounded-full bg-[var(--color-brand-accent)] px-3.5 py-1.5 text-[12px] font-bold uppercase tracking-[0.14em] text-[var(--color-brand-accent-foreground)] shadow-[3px_3px_0_rgb(0_0_0/0.45)]">
              {section.eyebrow}
            </p>
          ) : null}
          <h1 className="depth-title display-hero animate-rise text-white [animation-delay:80ms]">{section.title}</h1>
          {section.subtitle ? (
            <p className="animate-rise mt-5 max-w-[34rem] text-pretty text-[15px] leading-[1.7] text-white/80 [animation-delay:160ms] md:text-[17px]">
              {section.subtitle}
            </p>
          ) : null}

          {section.primaryCta || secondary ? (
            <div className={cn("animate-rise mt-7 flex flex-wrap items-center gap-x-7 gap-y-4 [animation-delay:240ms]", centered && "justify-center lg:justify-start")}>
              {section.primaryCta ? <CtaLink cta={{ ...section.primaryCta, style: "primary" }} size="lg" arrow /> : null}
              {secondary ? (
                <Link
                  href={secondary.href}
                  className="inline-flex items-center gap-2.5 text-[15px] font-semibold text-white underline decoration-white/40 underline-offset-[7px] transition-[text-decoration-color] duration-200 hover:decoration-white"
                >
                  {/reserv|book|table/i.test(`${secondary.href} ${secondary.label}`) ? (
                    <CalendarDays className="size-[18px] text-[var(--color-brand-accent)]" aria-hidden />
                  ) : (
                    <ArrowRight className="size-[18px] text-[var(--color-brand-accent)]" aria-hidden />
                  )}
                  {secondary.label}
                </Link>
              ) : null}
            </div>
          ) : null}

          {status && location ? (
            <p className={cn("animate-rise mt-7 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-white/75 [animation-delay:320ms]", centered && "justify-center lg:justify-start")}>
              <span className="flex items-center gap-2 font-semibold text-white">
                <span aria-hidden className={cn("relative size-2 rounded-full", STATUS_DOT[status.state])}>
                  {status.state !== "closed" ? <span className={cn("absolute inset-0 animate-ping rounded-full opacity-70", STATUS_DOT[status.state])} /> : null}
                </span>
                {status.headline}
              </span>
              {status.detail ? <span>{status.detail}</span> : null}
              <span className="flex items-center gap-1.5">
                <MapPin className="size-3.5" aria-hidden />
                {[location.name, location.city].filter(Boolean).join(", ")}
              </span>
            </p>
          ) : null}
        </div>
      </div>

      {section.highlights.length ? (
        <div className="relative -rotate-[1.5deg] border-y-2 border-black/80 bg-[var(--color-brand-accent)] py-2.5 text-[var(--color-brand-accent-foreground)] shadow-[0_6px_0_rgb(0_0_0/0.35)]">
          <div className="depth-marquee flex w-max gap-10 whitespace-nowrap text-[14px] font-extrabold uppercase tracking-[0.12em]">
            {/* two copies so the band loops seamlessly; the second is hidden from screen readers */}
            {[0, 1].map((copy) => (
              <ul key={copy} aria-hidden={copy === 1 || undefined} className="flex shrink-0 gap-10">
                {[...section.highlights, ...section.highlights].map((highlight, index) => (
                  <li key={`${highlight}-${index}`} className="flex items-center gap-10">
                    {highlight}
                    <span aria-hidden>✦</span>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
