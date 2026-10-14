import Image from "next/image";
import Link from "next/link";
import { ArrowDown } from "lucide-react";
import type { StorefrontContext } from "@/shared/contract/models";
import type { StatsBandSection as StatsBandSectionConfig } from "@/shared/contract/sections";
import { resolveImage } from "@/web/media";

/**
 * A full-bleed photo band: an explore/scroll action over the photo, then a caption and a row of
 * admin-entered numbers along the bottom — not computed from real data, the restaurant types them in
 * (same as `about.stats`). Nothing to show (no photo, no caption, no stats, no action) renders nothing.
 */
export function StatsBandSection({ section, context }: { section: StatsBandSectionConfig; context: StorefrontContext }) {
  const image = resolveImage(section.image?.url) ?? resolveImage(context.restaurant.coverUrl);
  if (!image && !section.caption && !section.stats.length && !section.exploreCta) return null;

  return (
    <section className="tone-night relative isolate overflow-hidden">
      {image ? (
        <>
          <Image src={image} alt={section.image?.alt ?? ""} fill sizes="100vw" className="object-cover" />
          <span
            aria-hidden
            className="absolute inset-0 bg-[linear-gradient(180deg,rgb(0_0_0/0.1)_0%,rgb(0_0_0/0.35)_55%,rgb(0_0_0/0.72)_100%)]"
          />
        </>
      ) : null}

      <div className="container-page relative flex min-h-[24rem] flex-col justify-between gap-12 py-14 md:min-h-[28rem] md:py-20">
        {section.exploreCta ? (
          <Link
            href={section.exploreCta.href}
            className="group/explore mx-auto flex size-[6.5rem] flex-col items-center justify-center gap-1.5 rounded-full bg-[var(--color-ink)] text-center text-[var(--color-canvas)] shadow-[0_18px_30px_-14px_rgb(0_0_0/0.55)] transition-transform duration-300 ease-[var(--ease-out)] hover:scale-105 focus-visible:scale-105 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            <ArrowDown
              className="size-[18px] transition-transform duration-300 ease-[var(--ease-out)] group-hover/explore:translate-y-0.5"
              aria-hidden
            />
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em]">{section.exploreCta.label}</span>
          </Link>
        ) : (
          <span />
        )}

        {section.caption || section.stats.length ? (
          <div className="flex flex-col gap-7 border-t border-white/15 pt-6 text-white md:flex-row md:items-end md:justify-between md:gap-10">
            {section.caption ? (
              <p className="max-w-sm text-[14px] leading-relaxed text-white/80">{section.caption}</p>
            ) : (
              <span />
            )}
            {section.stats.length ? (
              <ul className="flex flex-wrap gap-x-10 gap-y-5">
                {section.stats.map((stat, index) => (
                  <li key={index}>
                    <p className="tabular display-2 leading-none">{stat.value}</p>
                    <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70">{stat.label}</p>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
