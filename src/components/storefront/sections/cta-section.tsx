import Image from "next/image";
import type { StorefrontContext } from "@/shared/contract/models";
import type { CtaSection as CtaConfig } from "@/shared/contract/sections";
import { resolveImage } from "@/web/media";
import { cn } from "@/shared/utils";
import { CtaLink } from "@/components/storefront/cta-link";
import type { SectionTone } from "@/components/storefront/section-shell";

/**
 * A closing band, full width. `image` = the configured photograph under a scrim, `primary` = the brand
 * colour as ground (buttons invert by themselves, see `.tone-brand`), `neutral` = whatever the page rhythm
 * gives it (section-rhythm.ts); a neutral band that lands on the night ground borrows the restaurant's
 * own cover photograph, so it closes the page on an image instead of a flat panel.
 */
export function CtaSection({
  section,
  context,
  tone: rhythm,
}: {
  section: CtaConfig;
  context: StorefrontContext;
  tone?: SectionTone;
}) {
  const configured = section.tone === "image" ? resolveImage(section.image?.url) : null;
  const tone: SectionTone = configured ? "night" : section.tone === "primary" ? "brand" : (rhythm ?? "muted");
  const image = configured ?? (tone === "night" ? resolveImage(context.restaurant.coverUrl) : null);

  return (
    <section className={cn(`tone-${tone}`, "relative isolate overflow-hidden")}>
      {image ? (
        <>
          <Image src={image} alt="" fill sizes="100vw" className="-z-20 object-cover" />
          <span
            aria-hidden
            className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgb(0_0_0/0.82)_0%,rgb(0_0_0/0.6)_50%,rgb(0_0_0/0.35)_100%)]"
          />
        </>
      ) : null}
      <div
        className={cn(
          "container-page flex flex-col items-start gap-8 md:flex-row md:items-end md:justify-between",
          image ? "py-16 md:py-20" : "py-12 md:py-14",
        )}
      >
        <div className="max-w-2xl">
          <span aria-hidden className="mb-5 block h-px w-12 bg-[var(--color-brand-accent)]" />
          <h2 className="display-1">{section.title}</h2>
          {section.subtitle ? (
            <p className="mt-4 max-w-[52ch] text-[15.5px] leading-relaxed text-[var(--color-muted-ink)]">{section.subtitle}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          {section.cta ? <CtaLink cta={{ ...section.cta, style: "primary" }} size="lg" arrow /> : null}
          {section.secondaryCta ? (
            <CtaLink cta={{ ...section.secondaryCta, style: image ? "glass" : "outline" }} size="lg" />
          ) : null}
        </div>
      </div>
    </section>
  );
}
