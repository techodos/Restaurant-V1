import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarDays, MapPin, Mouse } from "lucide-react";
import type { StorefrontContext } from "@/shared/contract/models";
import type { HeroSection as HeroSectionConfig } from "@/shared/contract/sections";
import { resolveImage } from "@/web/media";
import { cn } from "@/shared/utils";
import { CtaLink } from "@/components/storefront/cta-link";
import { serviceStatus } from "@/components/storefront/service-status";

const HEIGHTS: Record<string, string> = {
  sm: "min-h-[min(58svh,560px)]",
  md: "min-h-[min(68svh,640px)]",
  lg: "min-h-[min(100svh,900px)]",
  full: "min-h-[100svh]",
};

const STATUS_DOT = {
  open: "bg-[var(--color-success)]",
  closing: "bg-[var(--color-warning)]",
  closed: "bg-white/45",
} as const;

/**
 * The cinematic first viewport: the restaurant's own photograph full bleed under a directional scrim,
 * the eyebrow, a serif headline, the introduction and two actions, then a quiet line that reads the
 * real hour from the primary location (open now until, closing soon, or when it opens). When it is the
 * first section of a page the header floats over it (SectionRenderer marks it `data-hero-overlay`).
 * Everything shown comes from the database.
 */
export function HeroSection({ section, context }: { section: HeroSectionConfig; context: StorefrontContext }) {
  const image = resolveImage(section.image?.url) ?? resolveImage(context.restaurant.coverUrl);
  const overlay = section.overlay;
  const centered = section.alignment === "center";
  const compact = section.height === "sm";
  const location = context.primaryLocation;
  const status = location && !compact ? serviceStatus(location.hours, new Date(), context.restaurant.timezone) : null;
  const secondary = section.secondaryCta;

  return (
    <section
      className={cn(
        "tone-night relative isolate flex flex-col overflow-hidden",
        HEIGHTS[section.height] ?? HEIGHTS.lg,
      )}
    >
      {image ? (
        <>
          <Image
            src={image}
            alt={section.image?.alt ?? ""}
            fill
            priority
            sizes="100vw"
            className="animate-hero -z-20 object-cover"
          />
          {/* directional scrim: dark where the type sits, the photograph left clear on the other side */}
          <span
            aria-hidden
            className="absolute inset-0 -z-10"
            style={{
              background: centered
                ? `linear-gradient(180deg, rgb(0 0 0 / ${Math.min(overlay + 0.2, 0.85)}) 0%, rgb(0 0 0 / ${overlay}) 45%, rgb(0 0 0 / ${Math.min(overlay + 0.25, 0.9)}) 100%)`
                : `linear-gradient(90deg, rgb(0 0 0 / ${Math.min(overlay + 0.3, 0.9)}) 0%, rgb(0 0 0 / ${overlay}) 42%, rgb(0 0 0 / ${Math.max(overlay - 0.35, 0.05)}) 78%), linear-gradient(180deg, rgb(0 0 0 / 0.45) 0%, transparent 28%, transparent 62%, rgb(0 0 0 / 0.55) 100%)`,
            }}
          />
        </>
      ) : (
        <span
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_80%_20%,color-mix(in_srgb,var(--color-brand)_35%,transparent),transparent_60%)]"
        />
      )}

      <div
        className={cn(
          "container-page flex w-full flex-1 flex-col justify-center pb-10 pt-20 [[data-hero-overlay]_&]:pt-[calc(var(--header-h,4.25rem)+3rem)]",
          centered && "items-center text-center",
        )}
      >
        <div className={cn("max-w-[44rem]", centered && "mx-auto")}>
          {section.eyebrow ? (
            <p className={cn("eyebrow animate-rise mb-4 text-white/85", centered && "justify-center")}>{section.eyebrow}</p>
          ) : null}
          <h1 className={cn("animate-rise text-white [animation-delay:80ms]", compact ? "display-1" : "display-hero")}>
            {section.title}
          </h1>
          {section.subtitle ? (
            <p
              className={cn(
                "animate-rise mt-5 max-w-[36rem] text-pretty text-[15px] leading-[1.75] text-white/80 [animation-delay:160ms] md:text-[17px]",
                centered && "mx-auto",
              )}
            >
              {section.subtitle}
            </p>
          ) : null}

          {section.primaryCta || secondary ? (
            <div
              className={cn(
                "animate-rise mt-8 flex flex-wrap items-center gap-x-8 gap-y-4 [animation-delay:240ms]",
                centered && "justify-center",
              )}
            >
              {section.primaryCta ? <CtaLink cta={{ ...section.primaryCta, style: "primary" }} size="lg" arrow /> : null}
              {secondary ? (
                <Link
                  href={secondary.href}
                  className="group inline-flex items-center gap-2.5 text-[15px] font-semibold text-white underline decoration-white/40 decoration-1 underline-offset-[7px] transition-[text-decoration-color] duration-200 hover:decoration-white"
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
        </div>
      </div>

      {!compact ? (
        <div className="container-page relative w-full pb-8 md:pb-10">
          <div className="flex flex-col gap-4 border-t border-white/15 pt-5 text-[13px] text-white/75 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              <span className="hidden items-center gap-2.5 text-[10.5px] font-semibold uppercase tracking-[0.22em] text-white/70 md:inline-flex">
                <Mouse className="animate-cue size-[18px]" aria-hidden />
                Scroll to explore
              </span>
              {status && location ? (
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="flex items-center gap-2 font-semibold text-white">
                    <span aria-hidden className={cn("relative size-2 rounded-full", STATUS_DOT[status.state])}>
                      {status.state !== "closed" ? (
                        <span className={cn("absolute inset-0 animate-ping rounded-full opacity-70", STATUS_DOT[status.state])} />
                      ) : null}
                    </span>
                    {status.headline}
                  </span>
                  {status.detail ? <span>{status.detail}</span> : null}
                  <span className="flex items-center gap-1.5">
                    <MapPin className="size-3.5" aria-hidden />
                    {[location.name, location.city].filter(Boolean).join(", ")}
                  </span>
                </span>
              ) : null}
            </div>
            {section.highlights.length ? (
              <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
                {section.highlights.map((highlight) => (
                  <li key={highlight} className="flex items-center gap-2">
                    <span aria-hidden className="size-1 rounded-full bg-[var(--color-brand-accent)]" />
                    {highlight}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
