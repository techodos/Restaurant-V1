import Image from "next/image";
import type { CtaSection as CtaConfig } from "@/shared/contract/sections";
import { resolveImage } from "@/web/media";
import { cn } from "@/shared/utils";
import { CtaLink } from "@/components/storefront/cta-link";

const TONES = {
  primary: "bg-[var(--color-brand)] text-[var(--color-brand-foreground)]",
  neutral: "bg-[var(--color-surface)] text-[var(--color-ink)] border border-[var(--color-hairline)] shadow-[var(--shadow-card)]",
  image: "bg-[var(--color-brand-secondary)] text-white",
} as const;

export function CtaSection({ section }: { section: CtaConfig }) {
  const image = section.tone === "image" ? resolveImage(section.image?.url) : null;
  const tone = image ? TONES.image : TONES[section.tone];
  const onColour = Boolean(image) || section.tone === "primary";

  return (
    <section className="container-page py-8 md:py-10">
      <div className={cn("relative isolate overflow-hidden rounded-[var(--radius-panel)] px-6 py-12 sm:px-10 md:px-14 md:py-16", tone)}>
        {section.tone === "primary" && !image ? (
          <span
            aria-hidden
            className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_100%_0%,rgba(255,255,255,0.16),transparent_55%)]"
          />
        ) : null}
        {image ? (
          <>
            <Image src={image} alt="" fill sizes="100vw" className="-z-10 object-cover opacity-40" />
            <span aria-hidden className="absolute inset-0 -z-10 bg-black/45" />
          </>
        ) : null}
        <div className="relative flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-balance text-[1.9rem] font-semibold leading-[1.1] md:text-[2.5rem]">{section.title}</h2>
            {section.subtitle ? (
              <p className={cn("mt-3", section.tone === "neutral" && !image ? "text-[var(--color-muted-ink)]" : "opacity-90")}>
                {section.subtitle}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            {/* on a coloured or photo panel the configured styles would vanish into the background */}
            {section.cta ? <CtaLink cta={onColour ? { ...section.cta, style: "inverse" } : section.cta} size="lg" /> : null}
            {section.secondaryCta ? (
              <CtaLink
                cta={{ ...section.secondaryCta, style: onColour ? "glass" : (section.secondaryCta.style ?? "ghost") }}
                size="lg"
              />
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
