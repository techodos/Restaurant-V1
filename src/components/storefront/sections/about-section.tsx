import Image from "next/image";
import type { StorefrontContext } from "@/shared/contract/models";
import type { AboutSection as AboutConfig } from "@/shared/contract/sections";
import { resolveImage } from "@/web/media";
import { cn } from "@/shared/utils";
import { CtaLink } from "@/components/storefront/cta-link";

/**
 * The restaurant's story as a full-bleed editorial split: the photograph fills one half edge to edge,
 * the other half is the night surface with the story, its action and the restaurant's own figures set
 * as a column of highlights. Photo side follows `imagePosition`.
 */
export function AboutSection({ section, context }: { section: AboutConfig; context: StorefrontContext }) {
  const image = resolveImage(section.image?.url) ?? resolveImage(context.restaurant.coverUrl);
  const right = section.imagePosition === "right";
  const paragraphs = section.body.split(/\n{2,}/).filter(Boolean);

  return (
    <section className="tone-night grid grid-cols-[minmax(0,1fr)] lg:grid-cols-2">
      <div className={cn("relative min-h-[20rem] overflow-hidden sm:min-h-[24rem] lg:min-h-[34rem]", right && "lg:order-2")}>
        {image ? (
          <Image
            src={image}
            alt={section.image?.alt ?? section.title}
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="reveal-plate object-cover"
          />
        ) : (
          <span aria-hidden className="absolute inset-0 bg-[var(--steel-2)]" />
        )}
      </div>

      <div className={cn("flex items-center", right && "lg:order-1")}>
        <div
          className={cn(
            "grid w-full grid-cols-[minmax(0,1fr)] gap-8 px-5 py-12 md:px-10 md:py-14 lg:max-w-[42rem] lg:px-14 xl:px-16",
            section.stats.length && "xl:max-w-[46rem] xl:grid-cols-[minmax(0,1fr)_auto] xl:gap-10",
            right && "lg:ml-auto",
          )}
        >
          <div>
            {section.eyebrow ? <p className="eyebrow mb-3">{section.eyebrow}</p> : null}
            <h2 className="display-1 lg:text-[clamp(2.2rem,1rem+2vw,3.1rem)]">{section.title}</h2>
            <div className="mt-5 space-y-3">
              {paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 32)} className="lede">
                  {paragraph}
                </p>
              ))}
            </div>
            {section.cta ? (
              <div className="mt-7">
                <CtaLink cta={{ ...section.cta, style: "primary" }} arrow />
              </div>
            ) : null}
          </div>

          {section.stats.length ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-6 border-t border-[var(--rule)] pt-6 xl:flex xl:flex-col xl:justify-center xl:gap-7 xl:border-l xl:border-t-0 xl:pl-10 xl:pt-0">
              {section.stats.map((stat) => (
                <div key={`${stat.value}-${stat.label}`} className="flex flex-col-reverse">
                  <dt className="mt-1.5 text-[12.5px] leading-snug text-[var(--color-muted-ink)]">{stat.label}</dt>
                  <dd className="tabular font-[family-name:var(--font-display)] text-[2.1rem] leading-none text-[var(--color-brand-accent)]">
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
      </div>
    </section>
  );
}
