import Image from "next/image";
import { Check } from "lucide-react";
import type { StorefrontContext } from "@/shared/contract/models";
import type { HeroSection as HeroSectionConfig } from "@/shared/contract/sections";
import { resolveImage } from "@/web/media";
import { cn } from "@/shared/utils";
import { CtaLink } from "@/components/storefront/cta-link";

const HEIGHTS: Record<string, string> = {
  sm: "min-h-[46vh] md:min-h-[52vh]",
  md: "min-h-[58vh] md:min-h-[62vh]",
  lg: "min-h-[72vh] md:min-h-[78vh]",
  full: "min-h-[88vh]",
};

export function HeroSection({ section, context }: { section: HeroSectionConfig; context: StorefrontContext }) {
  const image = resolveImage(section.image?.url);
  const overlay = section.overlay;

  return (
    <section className={cn("relative isolate flex items-center overflow-hidden", HEIGHTS[section.height] ?? HEIGHTS.lg)}>
      {image ? (
        <>
          <Image
            src={image}
            alt={section.image?.alt ?? ""}
            fill
            priority
            sizes="100vw"
            className="-z-20 object-cover"
          />
          <span
            aria-hidden
            className="absolute inset-0 -z-10"
            style={{ background: `linear-gradient(90deg, rgba(0,0,0,${Math.min(overlay + 0.2, 0.92)}) 0%, rgba(0,0,0,${overlay * 0.7}) 55%, rgba(0,0,0,${Math.max(overlay - 0.25, 0.12)}) 100%)` }}
          />
        </>
      ) : (
        <span aria-hidden className="absolute inset-0 -z-10 bg-[var(--color-brand-secondary)]" />
      )}

      <div className={cn("container-page w-full py-16", section.alignment === "center" && "text-center")}>
        <div className={cn("max-w-2xl", section.alignment === "center" && "mx-auto")}>
          {section.eyebrow ? (
            <p className="mb-4 inline-flex items-center rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-white backdrop-blur">
              {section.eyebrow}
            </p>
          ) : null}
          <h1 className="text-balance text-4xl font-semibold leading-[1.08] text-white md:text-6xl">{section.title}</h1>
          {section.subtitle ? (
            <p className="mt-5 text-pretty text-base text-white/85 md:text-lg">{section.subtitle}</p>
          ) : null}

          {section.highlights.length ? (
            <ul className={cn("mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/85", section.alignment === "center" && "justify-center")}>
              {section.highlights.map((highlight) => (
                <li key={highlight} className="inline-flex items-center gap-2">
                  <Check className="size-4 text-[var(--color-brand-accent)]" aria-hidden />
                  {highlight}
                </li>
              ))}
            </ul>
          ) : null}

          {(section.primaryCta || section.secondaryCta) && (
            <div className={cn("mt-8 flex flex-wrap gap-3", section.alignment === "center" && "justify-center")}>
              {section.primaryCta ? <CtaLink cta={section.primaryCta} size="lg" /> : null}
              {section.secondaryCta ? (
                <CtaLink
                  cta={{
                    ...section.secondaryCta,
                    style: section.secondaryCta.style === "primary" ? "outline" : section.secondaryCta.style,
                  }}
                  size="lg"
                />
              ) : null}
            </div>
          )}

          {context.primaryLocation ? (
            <p className="mt-6 text-sm text-white/70">
              {context.primaryLocation.name} ·{" "}
              {[context.primaryLocation.area, context.primaryLocation.city].filter(Boolean).join(", ")}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
