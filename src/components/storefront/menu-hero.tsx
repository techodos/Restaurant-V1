import Image from "next/image";
import type { MobileBannerHeight } from "@/shared/contract/sections";
import { Search } from "lucide-react";
import { MenuSortButton, type SortOption } from "./menu-hero-controls";

/** the night ground the photo fades into (theme token, so every restaurant gets its own) */
const NIGHT = (percent: number) =>
  `color-mix(in srgb, var(--color-night) ${percent}%, transparent)`;

interface MenuHeroProps {
  image: string | null;
  title: string | undefined;
  subtitle: string | undefined;
  /** 0 - 1 strength of the photo's gradient (super admin "Photo darkening"); undefined / 0 = the photo as uploaded */
  dim: number | undefined;
  /** phones only: the banner frame (super admin "Phone banner height"); default medium */
  mobileHeight?: MobileBannerHeight;
  search: {
    action: string;
    hidden: Record<string, string>;
    q: string;
    sort: string;
    placeholder: string | undefined;
    options: SortOption[];
  };
}

/**
 * The menu page's opening: a photo banner with the page title and tagline (both from page_content), then
 * the search row. The photo is never cropped: it renders at the full width of the page and takes its own
 * height from its own proportions at every screen size, so a banner with the headline baked into the
 * picture stays whole. It starts below the header (running under it hid the top of the picture). The search row sits below it, never over it, so it cannot cover text in the picture.
 */
/** static class strings (Tailwind must see them whole), one per phone banner height */
const PHONE_FRAME: Record<MobileBannerHeight, string> = {
  original: "",
  short: "max-md:aspect-[3/1] max-md:object-cover max-md:object-center",
  medium: "max-md:aspect-[2.6/1] max-md:object-cover max-md:object-center",
  tall: "max-md:aspect-[2.2/1] max-md:object-cover max-md:object-center",
  "extra-tall": "max-md:aspect-[1.8/1] max-md:object-cover max-md:object-center",
};

export function MenuHero({
  image,
  title,
  subtitle,
  dim,
  mobileHeight = "medium",
  search,
}: MenuHeroProps) {
  return (
    <>
      {/* the banner opens the page, so the header floats transparent over it and turns solid on scroll (like a home hero) */}
      <div data-hero-overlay className="-mt-[var(--header-h,4.25rem)]">
        <section className="tone-night relative isolate overflow-hidden bg-[var(--color-night)]">
          {image ? (
            <Image
              src={image}
              alt=""
              width={1920}
              height={640}
              priority
              sizes="100vw"
              // phones: the super admin's frame (page_content.mobileBannerHeight), centred so only the side edges are
              // trimmed; md+ keeps the whole upload at its own proportions (owner's no-crop rule)
              className={`block h-auto w-full ${PHONE_FRAME[mobileHeight]}`}
            />
          ) : null}
          {dim ? (
            <>
              <span
                aria-hidden
                className="absolute inset-0 -z-10 md:hidden"
                style={{
                  opacity: dim,
                  background: `linear-gradient(180deg, ${NIGHT(15)} 0%, ${NIGHT(35)} 40%, ${NIGHT(90)} 100%)`,
                }}
              />
              <span
                aria-hidden
                className="absolute inset-0 -z-10 hidden md:block"
                style={{
                  opacity: dim,
                  background: `linear-gradient(90deg, ${NIGHT(88)} 0%, ${NIGHT(62)} 32%, transparent 62%), linear-gradient(180deg, transparent 55%, ${NIGHT(55)} 100%)`,
                }}
              />
            </>
          ) : null}
          <div className="absolute inset-x-5 bottom-5 flex flex-col items-start gap-3 md:inset-x-0 md:bottom-0 md:mx-auto md:max-w-[1280px] md:gap-[14px] md:px-6 md:pb-[84px]">
            {title ? (
              <h1 className="display-face text-[clamp(1.9rem,8vw,2.75rem)] leading-[0.98] text-white md:text-[64px]">
                {title}
              </h1>
            ) : null}
            {subtitle ? (
              <p className="hidden max-w-[420px] text-[16px] leading-relaxed text-white/85 md:block">
                {subtitle}
              </p>
            ) : null}
          </div>
        </section>
      </div>

      <form
        action={search.action}
        className="relative z-10 mx-4 -mt-2.5 mb-6 flex gap-2 md:mx-auto md:-mt-[22px] md:mb-8 md:max-w-[1280px] md:px-6"
      >
        {Object.entries(search.hidden).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <div className="flex min-w-0 flex-1 gap-2.5 md:rounded-[14px] md:border md:border-[var(--color-hairline)] md:bg-[var(--color-surface)] md:p-1.5 md:shadow-[0_4px_14px_-4px_rgb(18_36_28/0.14)]">
          <label className="flex h-12 min-w-0 flex-1 items-center gap-3 rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-surface)] px-4 shadow-[0_2px_8px_-2px_rgb(18_36_28/0.12)] focus-within:border-[var(--color-brand)] md:h-10 md:rounded-[10px] md:border-transparent md:bg-[color-mix(in_srgb,var(--color-ink)_4%,var(--color-surface))] md:px-5 md:shadow-none">
            <Search
              className="size-5 shrink-0 text-[var(--color-brand)] md:size-5"
              aria-hidden
            />
            <input
              name="q"
              type="search"
              defaultValue={search.q}
              placeholder={search.placeholder}
              aria-label="Search the menu"
              className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-[var(--color-ink)] outline-none placeholder:text-[color-mix(in_srgb,var(--color-muted-ink)_55%,transparent)] md:text-[16px]"
            />
          </label>
          {/* phones: Enter submits with the current sort; the sort itself lives in the sheet */}
          <label className="hidden h-10 w-[240px] shrink-0 items-center gap-3 rounded-[10px] border border-[var(--color-hairline)] px-4 md:flex">
            <span className="text-[13px] text-[var(--color-muted-ink)]">
              Sort
            </span>
            <select
              name="sort"
              defaultValue={search.sort}
              className="h-full min-w-0 flex-1 cursor-pointer bg-transparent text-[15px] font-medium text-[var(--color-ink)] outline-none"
            >
              {search.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="press hidden h-10 shrink-0 rounded-[10px] bg-[var(--color-brand)] px-7 text-[14px] font-semibold text-[var(--color-brand-foreground)] transition-[filter] hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand)] md:block"
          >
            Search
          </button>
        </div>
        <MenuSortButton options={search.options} />
      </form>
    </>
  );
}
