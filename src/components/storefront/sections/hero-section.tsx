import Image from "next/image";
import { Check, MapPin } from "lucide-react";
import type { StorefrontContext } from "@/shared/contract/models";
import type { HeroSection as HeroSectionConfig } from "@/shared/contract/sections";
import { resolveImage } from "@/web/media";
import { cn } from "@/shared/utils";
import { CtaLink } from "@/components/storefront/cta-link";

const HEIGHTS: Record<string, string> = {
  sm: "min-h-[44dvh] md:min-h-[48dvh]",
  md: "min-h-[60dvh] md:min-h-[64dvh]",
  lg: "min-h-[76dvh] md:min-h-[min(86dvh,880px)]",
  full: "min-h-[92dvh]",
};

export function HeroSection({ section, context }: { section: HeroSectionConfig; context: StorefrontContext }) {
  const image = resolveImage(section.image?.url);
  const overlay = section.overlay;
  const centered = section.alignment === "center";
  const compact = section.height === "sm";

  return (
    <section
      className={cn(
        "relative isolate flex overflow-hidden bg-[var(--color-brand-secondary)]",
        compact || centered ? "items-center" : "items-end",
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
          {/* two scrims: one from the reading side, one from the bottom, so text stays readable on any photo */}
          <span
            aria-hidden
            className="absolute inset-0 -z-10"
            style={{
              background: centered
                ? `radial-gradient(ellipse at center, rgba(12,12,12,${Math.min(overlay + 0.15, 0.85)}) 0%, rgba(12,12,12,${overlay * 0.75}) 70%)`
                : `linear-gradient(100deg, rgba(12,12,12,${Math.min(overlay + 0.25, 0.9)}) 0%, rgba(12,12,12,${overlay * 0.65}) 48%, rgba(12,12,12,${Math.max(overlay - 0.35, 0.05)}) 100%)`,
            }}
          />
          <span aria-hidden className="absolute inset-x-0 bottom-0 -z-10 h-1/2 bg-gradient-to-t from-black/55 to-transparent" />
        </>
      ) : (
        <span
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,color-mix(in_srgb,var(--color-brand)_45%,transparent),transparent_60%)]"
        />
      )}

      <div className={cn("container-page w-full", compact ? "py-14 md:py-16" : "pb-14 pt-24 md:pb-20 md:pt-28", centered && "text-center")}>
        <div className={cn("max-w-[44rem]", centered && "mx-auto")}>
          {section.eyebrow ? (
            <p className="mb-5 inline-flex items-center rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-white backdrop-blur-md">
              {section.eyebrow}
            </p>
          ) : null}
          <h1
            className={cn(
              "text-balance font-semibold text-white",
              compact
                ? "text-4xl leading-[1.05] md:text-5xl"
                : "text-[2.6rem] leading-[1.02] sm:text-5xl md:text-6xl lg:text-[4.5rem]",
            )}
          >
            {section.title}
          </h1>
          {section.subtitle ? (
            <p className={cn("mt-5 max-w-[38rem] text-pretty text-base leading-relaxed text-white/85 md:text-lg", centered && "mx-auto")}>
              {section.subtitle}
            </p>
          ) : null}

          {(section.primaryCta || section.secondaryCta) && (
            <div className={cn("mt-8 flex flex-wrap gap-3", centered && "justify-center")}>
              {section.primaryCta ? <CtaLink cta={section.primaryCta} size="lg" /> : null}
              {section.secondaryCta ? (
                <CtaLink cta={{ ...section.secondaryCta, style: "glass" }} size="lg" />
              ) : null}
            </div>
          )}

          {section.highlights.length ? (
            <ul
              className={cn(
                "mt-10 flex flex-wrap gap-x-6 gap-y-2.5 border-t border-white/15 pt-5 text-[13px] font-medium text-white/80",
                centered && "justify-center",
              )}
            >
              {section.highlights.map((highlight) => (
                <li key={highlight} className="inline-flex items-center gap-2">
                  <span className="grid size-5 place-items-center rounded-full bg-white/12">
                    <Check className="size-3 text-[var(--color-brand-accent)]" aria-hidden />
                  </span>
                  {highlight}
                </li>
              ))}
            </ul>
          ) : null}

          {context.primaryLocation && !compact ? (
            <p className={cn("mt-4 inline-flex items-center gap-1.5 text-[13px] text-white/65", centered && "justify-center")}>
              <MapPin className="size-3.5" aria-hidden />
              {[context.primaryLocation.name, context.primaryLocation.city].filter(Boolean).join(", ")}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
