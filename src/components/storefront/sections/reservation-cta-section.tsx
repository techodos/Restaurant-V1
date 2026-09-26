import Image from "next/image";
import { ArrowRight, CalendarDays, Users } from "lucide-react";
import type { StorefrontContext } from "@/shared/contract/models";
import type { ReservationCtaSection as ReservationConfig } from "@/shared/contract/sections";
import { resolveImage } from "@/web/media";
import { zonedNow } from "@/shared/hours";
import { CtaLink } from "@/components/storefront/cta-link";

/**
 * Full-bleed reservation band: the photograph under a directional scrim, the invitation on the left and
 * a quick booking bar on the right that opens the booking page with the date and party size already
 * chosen (plain GET form, works without JavaScript). Without online reservations it falls back to the
 * configured button.
 */
export function ReservationCtaSection({
  section,
  context,
}: {
  section: ReservationConfig;
  context: StorefrontContext;
}) {
  const { restaurant } = context;
  const image = resolveImage(section.image?.url) ?? resolveImage(restaurant.coverUrl);
  const phone = section.phoneLabel ? restaurant.phone : null;
  const settings = restaurant.settings.reservations;
  const bookable = restaurant.features.reservations && settings.enabled;

  const dates = bookable
    ? Array.from({ length: Math.min(settings.maxAdvanceDays, 13) + 1 }, (_, offset) => {
        const day = zonedNow(new Date(Date.now() + offset * 86_400_000), restaurant.timezone);
        const label = new Date(`${day.dateKey}T12:00:00Z`).toLocaleDateString(restaurant.locale, {
          weekday: "short",
          day: "numeric",
          month: "short",
          timeZone: "UTC",
        });
        return { value: day.dateKey, label: offset === 0 ? `Today, ${label}` : offset === 1 ? `Tomorrow, ${label}` : label };
      })
    : [];
  const guests = bookable
    ? Array.from({ length: settings.maxGuests - settings.minGuests + 1 }, (_, index) => settings.minGuests + index)
    : [];
  const defaultGuests = Math.min(Math.max(2, settings.minGuests), settings.maxGuests);

  const field =
    "h-12 w-full cursor-pointer appearance-none rounded-[var(--radius-brand)] border border-white/20 bg-black/25 pl-10 pr-4 text-[14px] text-white outline-none transition-colors hover:border-white/45 focus-visible:border-white [&>option]:text-black";

  return (
    <section className="tone-night relative isolate overflow-hidden">
      {image ? (
        <>
          <Image src={image} alt="" fill sizes="100vw" className="-z-20 object-cover" />
          <span aria-hidden className="scrim-left absolute inset-0 -z-10" />
          <span aria-hidden className="absolute inset-0 -z-10 bg-black/20" />
        </>
      ) : null}
      <div className="container-page grid grid-cols-[minmax(0,1fr)] items-center gap-8 py-14 text-white md:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-12">
        <div className="max-w-xl">
          <p className="eyebrow mb-3 text-white/80">Reservations</p>
          <h2 className="display-1">{section.title}</h2>
          {section.subtitle ? <p className="mt-3 max-w-[46ch] text-[15.5px] leading-relaxed text-white/80">{section.subtitle}</p> : null}
          {phone ? (
            <p className="mt-5 text-sm text-white/75">
              {section.phoneLabel}{" "}
              <a href={`tel:${phone.replace(/\s+/g, "")}`} className="font-semibold text-white underline decoration-white/40 underline-offset-4 hover:decoration-white">
                {phone}
              </a>
            </p>
          ) : null}
        </div>

        {bookable ? (
          <form
            action={`/r/${restaurant.slug}/reservation`}
            className="grid grid-cols-1 gap-3 rounded-[var(--radius-panel)] border border-white/15 bg-black/35 p-3 backdrop-blur-md sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto]"
          >
            <label className="relative block">
              <span className="sr-only">Date</span>
              <CalendarDays className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[var(--color-brand-accent)]" aria-hidden />
              <select name="date" defaultValue={dates[0]?.value} className={field}>
                {dates.map((date) => (
                  <option key={date.value} value={date.value}>
                    {date.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="relative block">
              <span className="sr-only">Guests</span>
              <Users className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[var(--color-brand-accent)]" aria-hidden />
              <select name="guests" defaultValue={defaultGuests} className={field}>
                {guests.map((count) => (
                  <option key={count} value={count}>
                    {count} guest{count === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="press group inline-flex h-12 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-brand)] px-7 text-sm font-semibold text-[var(--color-brand-foreground)] transition-[background-color,box-shadow] duration-200 hover:bg-[color-mix(in_srgb,var(--color-brand)_86%,black)] hover:shadow-[var(--shadow-brand)]"
            >
              {section.cta?.label ?? "Book a table"}
              <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden />
            </button>
          </form>
        ) : section.cta ? (
          <div className="lg:justify-self-end">
            <CtaLink cta={{ ...section.cta, style: "primary" }} size="lg" arrow />
          </div>
        ) : null}
      </div>
    </section>
  );
}
