import Image from "next/image";
import type { StorefrontContext } from "@/shared/contract/models";
import type { HeroSection as HeroSectionConfig } from "@/shared/contract/sections";
import { resolveImage } from "@/web/media";
import { cn } from "@/shared/utils";
import { CtaLink } from "@/components/storefront/cta-link";
import { DishTile } from "@/components/storefront/dish-tile";
import { Rail } from "@/components/storefront/rail";
import { serviceStatus } from "@/components/storefront/service-status";
import { searchMenu } from "@/server/services/catalog";

/**
 * The hero's alternative compositions (`layout`: framed, collage, dishes). Same content as the cinematic
 * hero — eyebrow, title, subtitle, the two buttons, the primary location's real hours — only arranged
 * differently; `split` lives in hero-section.tsx. Light grounds carry `data-hero-light` so a header
 * floating over them keeps dark type.
 */

type HeroProps = { section: HeroSectionConfig; context: StorefrontContext };

const DOT = {
  open: "bg-[var(--color-success)]",
  closing: "bg-[var(--color-warning)]",
  closed: "bg-[var(--color-muted-ink)]",
} as const;

/** first-section heroes run under the floating header: clear it, then breathe */
const UNDER_HEADER = "[[data-hero-overlay]_&]:pt-[calc(var(--header-h,4.25rem)+1rem)]";

function heroImage(section: HeroSectionConfig, context: StorefrontContext) {
  return resolveImage(section.image?.url) ?? resolveImage(context.restaurant.coverUrl);
}

function HeroCopy({ section, size = "hero", className }: { section: HeroSectionConfig; size?: "hero" | "1"; className?: string }) {
  return (
    <div className={className}>
      {section.eyebrow ? <p className="eyebrow animate-rise mb-4">{section.eyebrow}</p> : null}
      <h1 className={cn("animate-rise text-balance [animation-delay:60ms]", size === "hero" ? "display-hero" : "display-1")}>
        {section.title}
      </h1>
    </div>
  );
}

function HeroActions({ section, className }: { section: HeroSectionConfig; className?: string }) {
  if (!section.primaryCta && !section.secondaryCta) return null;
  return (
    <div className={cn("animate-rise flex flex-wrap items-center gap-3 [animation-delay:200ms]", className)}>
      {section.primaryCta ? <CtaLink cta={{ ...section.primaryCta, style: "primary" }} size="lg" arrow /> : null}
      {section.secondaryCta ? <CtaLink cta={{ ...section.secondaryCta, style: "outline" }} size="lg" /> : null}
    </div>
  );
}

/** Framed: the photograph in a rounded frame with the live hour on it, the headline set beneath. */
export function FramedHero({ section, context }: HeroProps) {
  const image = heroImage(section, context);
  const location = context.primaryLocation;
  const status = location ? serviceStatus(location.hours, new Date(), context.restaurant.timezone) : null;
  return (
    <section data-hero-light className="tone-paper relative isolate">
      <div className={cn("container-page pb-12 pt-4 md:pb-16 md:pt-6", UNDER_HEADER)}>
        <div className="relative h-[min(34svh,300px)] min-h-[220px] md:h-[min(54svh,520px)] md:min-h-[300px] overflow-hidden rounded-[var(--radius-panel)] bg-[var(--steel-2)]">
          {image ? (
            <Image
              src={image}
              alt={section.image?.alt ?? ""}
              fill
              priority
              sizes="(min-width: 1312px) 1200px, 100vw"
              className="animate-hero object-cover"
            />
          ) : null}
          {status ? (
            <p className="absolute bottom-4 left-4 flex max-w-[calc(100%-2rem)] items-center gap-2.5 rounded-full bg-[color-mix(in_srgb,var(--color-canvas)_90%,transparent)] px-4 py-2 text-[13px] font-semibold text-[var(--color-ink)] shadow-[0_10px_30px_-18px_rgb(0_0_0/0.6)] backdrop-blur-md md:bottom-5 md:left-5">
              <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", DOT[status.state])} />
              <span className="truncate">
                {status.headline}
                {status.detail ? <span className="font-normal text-[var(--color-muted-ink)]"> · {status.detail}</span> : null}
              </span>
            </p>
          ) : null}
        </div>
        <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-4 md:mt-12 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] md:items-end md:gap-14">
          <HeroCopy section={section} />
          <div className="animate-rise [animation-delay:120ms]">
            {section.subtitle ? (
              <p className="max-w-[34rem] text-pretty text-[15px] leading-[1.75] text-[var(--color-muted-ink)] md:text-[16px]">
                {section.subtitle}
              </p>
            ) : null}
            <HeroActions section={section} className={section.subtitle ? "mt-6" : undefined} />
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Collage: the headline beside a mosaic of the cover photo and up to three more. 1 photo = one tall frame,
 * 2 = side by side, 3 = the first tall beside two stacked, 4 = the first tall beside a column of three.
 * A photo listed twice (e.g. the main photo again among the extras) is shown once.
 */
export function CollageHero({ section, context }: HeroProps) {
  const main = heroImage(section, context);
  const candidates = [
    ...(main ? [{ src: main, alt: section.image?.alt ?? "" }] : []),
    ...section.galleryImages.map((image) => ({ src: resolveImage(image.url), alt: image.alt })),
  ];
  const tiles: { src: string; alt: string }[] = [];
  for (const candidate of candidates) {
    if (candidate.src && !tiles.some((tile) => tile.src === candidate.src)) tiles.push({ src: candidate.src, alt: candidate.alt });
  }
  tiles.splice(4);
  return (
    <section data-hero-light className="tone-paper relative isolate">
      <div
        className={cn(
          "container-page grid items-center gap-10 pb-14 pt-8 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] md:pb-20 md:pt-12 lg:gap-16",
          UNDER_HEADER,
        )}
      >
        <div>
          <HeroCopy section={section} />
          {section.subtitle ? (
            <p className="animate-rise mt-5 max-w-[30rem] text-pretty text-[15px] leading-[1.75] text-[var(--color-muted-ink)] [animation-delay:120ms] md:text-[16px]">
              {section.subtitle}
            </p>
          ) : null}
          <HeroActions section={section} className="mt-8" />
        </div>
        {tiles.length ? (
          <div
            className={cn(
              "grid h-[min(66svh,560px)] min-h-[340px] gap-3 md:gap-4",
              tiles.length === 1 && "grid-cols-1",
              tiles.length === 2 && "grid-cols-2",
              tiles.length === 3 && "grid-cols-2 grid-rows-2",
              tiles.length === 4 && "grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] grid-rows-3",
            )}
          >
            {tiles.map((tile, index) => (
              <figure
                key={index}
                className={cn(
                  "relative m-0 overflow-hidden rounded-[var(--radius-panel)] bg-[var(--steel-2)]",
                  index === 0 && tiles.length === 3 && "row-span-2",
                  index === 0 && tiles.length === 4 && "row-span-3",
                )}
              >
                <Image
                  src={tile.src}
                  alt={tile.alt}
                  fill
                  priority={index === 0}
                  sizes={tiles.length === 1 || index === 0 ? "(min-width: 768px) 32vw, 100vw" : "(min-width: 768px) 22vw, 50vw"}
                  className="animate-hero object-cover"
                />
              </figure>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Signature dishes: the headline on the night ground and the dishes themselves right under it, each with
 * the menu's own add control (same tile, same cart, same branch rules as everywhere else). Dishes are the
 * section's chosen slugs, else whatever the restaurant marked as featured.
 */
export async function DishesHero({ section, context }: HeroProps) {
  const slugs = section.dishSlugs;
  const found = slugs.length
    ? await searchMenu(context.restaurant.id, { slugs, limit: slugs.length })
    : await searchMenu(context.restaurant.id, { featuredOnly: true, limit: 3 });
  const dishes = slugs.length
    ? slugs.map((slug) => found.find((item) => item.slug === slug)).filter((item): item is NonNullable<typeof item> => Boolean(item))
    : found.slice(0, 3);
  return (
    <section className="tone-night relative isolate overflow-hidden">
      <div className={cn("container-page pb-12 pt-10 md:pb-16 md:pt-14", "[[data-hero-overlay]_&]:pt-[calc(var(--header-h,4.25rem)+2.5rem)]")}>
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between md:gap-12">
          <div className="max-w-[44rem]">
            <HeroCopy section={section} />
            {section.subtitle ? (
              <p className="animate-rise mt-4 max-w-[34rem] text-pretty text-[15px] leading-[1.75] text-[var(--color-muted-ink)] [animation-delay:120ms] md:text-[16px]">
                {section.subtitle}
              </p>
            ) : null}
          </div>
          <HeroActions section={section} className="shrink-0" />
        </div>
        {dishes.length ? (
          <Rail
            label="signature dishes"
            className="mt-9 md:mt-12"
            itemClassName="w-[80%] sm:w-[calc((100%-1.5rem)/2)] lg:w-[calc((100%-3rem)/3)]"
          >
            {dishes.map((item) => (
              <DishTile
                key={item.id}
                item={item}
                size="lg"
                restaurantSlug={context.restaurant.slug}
                browseOnly={context.restaurant.features.BranchingFeature}
                currencySymbol={context.restaurant.currencySymbol}
                locale={context.restaurant.locale}
              />
            ))}
          </Rail>
        ) : null}
      </div>
    </section>
  );
}
