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
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div className={cn("relative", section.imagePosition === "right" && "lg:order-2")}>
          {image ? (
            <div className="relative aspect-4/3 overflow-hidden rounded-[var(--radius-brand)] shadow-[var(--shadow-raised)]">
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
                "mt-5 grid grid-cols-2 gap-4 rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-5",
                image && "sm:absolute sm:-bottom-8 sm:right-4 sm:mt-0 sm:w-[62%] sm:shadow-[var(--shadow-raised)] lg:right-6",
              )}
            >
              {section.stats.map((stat) => (
                <div key={`${stat.value}-${stat.label}`}>
                  <dt className="text-xs uppercase tracking-wider text-[var(--color-muted-ink)]">{stat.label}</dt>
                  <dd className="font-[family-name:var(--font-heading)] text-2xl font-semibold">{stat.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>

        <div className={cn("space-y-4", section.imagePosition === "right" && "lg:order-1")}>
          {section.eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-brand)]">{section.eyebrow}</p>
          ) : null}
          <h2 className="text-balance text-3xl font-semibold leading-tight md:text-4xl">{section.title}</h2>
          <p className="text-pretty leading-relaxed text-[var(--color-muted-ink)]">{section.body}</p>
          {section.cta ? <CtaLink cta={section.cta} /> : null}
        </div>
      </div>
    </SectionShell>
  );
}
