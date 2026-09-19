import Image from "next/image";
import type { CtaSection as CtaConfig } from "@/lib/contract/sections";
import { resolveImage } from "@/lib/media";
import { cn } from "@/lib/utils";
import { CtaLink } from "../cta-link";

const TONES = {
  primary: "bg-[var(--color-brand)] text-[var(--color-brand-foreground)]",
  neutral: "bg-[var(--color-surface)] text-[var(--color-ink)] border border-[var(--color-hairline)]",
  image: "bg-[var(--color-brand-secondary)] text-white",
} as const;

export function CtaSection({ section }: { section: CtaConfig }) {
  const image = section.tone === "image" ? resolveImage(section.image?.url) : null;
  const tone = image ? TONES.image : TONES[section.tone];

  return (
    <section className="container-page py-6">
      <div className={cn("relative overflow-hidden rounded-[var(--radius-brand)] px-8 py-12 md:px-14 md:py-16", tone)}>
        {image ? (
          <>
            <Image src={image} alt="" fill sizes="100vw" className="-z-10 object-cover opacity-40" />
            <span aria-hidden className="absolute inset-0 -z-10 bg-black/45" />
          </>
        ) : null}
        <div className="relative flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-balance text-3xl font-semibold md:text-4xl">{section.title}</h2>
            {section.subtitle ? (
              <p className={cn("mt-3", section.tone === "neutral" && !image ? "text-[var(--color-muted-ink)]" : "opacity-90")}>
                {section.subtitle}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            {section.cta ? <CtaLink cta={section.cta} size="lg" /> : null}
            {section.secondaryCta ? (
              <CtaLink cta={{ ...section.secondaryCta, style: section.secondaryCta.style ?? "ghost" }} size="lg" />
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
