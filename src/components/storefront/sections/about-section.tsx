import Image from "next/image";
import type { StorefrontContext } from "@/shared/contract/models";
import type { AboutSection as AboutConfig } from "@/shared/contract/sections";
import { resolveImage } from "@/web/media";
import { cn } from "@/shared/utils";
import { CtaLink } from "@/components/storefront/cta-link";
import { SectionShell } from "@/components/storefront/section-shell";

export function AboutSection({ section }: { section: AboutConfig; context: StorefrontContext }) {
  const image = resolveImage(section.image?.url);

  return (
    <SectionShell tone="surface">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
        <div className={cn("relative", section.imagePosition === "right" && "lg:order-2")}>
          {image ? (
            <div className="relative aspect-[4/5] overflow-hidden rounded-[var(--radius-panel)] shadow-[var(--shadow-raised)] sm:aspect-[5/4]">
              <Image
                src={image}
                alt={section.image?.alt ?? section.title}
                fill
                sizes="(min-width: 1024px) 560px, 92vw"
                className="object-cover"
              />
            </div>
          ) : null}
          {section.stats.length ? (
            <dl
              className={cn(
                "surface-card mt-5 grid grid-cols-2 gap-x-6 gap-y-5 p-6",
                image && "sm:absolute sm:-bottom-10 sm:-right-4 sm:mt-0 sm:w-[64%] sm:shadow-[var(--shadow-raised)] lg:-right-8",
              )}
            >
              {section.stats.map((stat) => (
                <div key={`${stat.value}-${stat.label}`}>
                  <dt className="text-xs text-[var(--color-muted-ink)]">{stat.label}</dt>
                  <dd className="tabular mt-1 font-[family-name:var(--font-display)] text-3xl font-semibold tracking-[-0.02em]">{stat.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>

        <div className={cn("space-y-5 sm:pt-6 lg:pt-0", section.imagePosition === "right" && "lg:order-1")}>
          {section.eyebrow ? (
            <p className="eyebrow">{section.eyebrow}</p>
          ) : null}
          <h2 className="text-balance text-[2rem] font-semibold leading-[1.08] md:text-[2.6rem]">{section.title}</h2>
          <p className="max-w-[58ch] text-pretty text-base leading-relaxed text-[var(--color-muted-ink)] md:text-[17px]">{section.body}</p>
          {section.cta ? <CtaLink cta={section.cta} /> : null}
        </div>
      </div>
    </SectionShell>
  );
}
