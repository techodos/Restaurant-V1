import { ArrowUpRight, MapPin, Phone } from "lucide-react";
import type { StorefrontContext } from "@/shared/contract/models";
import type { LocationsSection as LocationsConfig } from "@/shared/contract/sections";
import { formatHours, zonedNow } from "@/shared/hours";
import { cn } from "@/shared/utils";
import { SectionHeading } from "@/components/storefront/section-heading";
import { SectionShell } from "@/components/storefront/section-shell";
import { serviceStatus } from "@/components/storefront/service-status";
import { getLocations } from "@/server/services/restaurants";

/** Every active location as an editorial block: name, live open / closed line, address, phone and the full week of hours. */
export async function LocationsSection({ section, context }: { section: LocationsConfig; context: StorefrontContext }) {
  const locations = (await getLocations(context.restaurant.id))
    .filter((location) => location.isActive)
    .slice(0, section.limit);

  if (!locations.length) return null;
  const { timezone } = context.restaurant;
  const today = zonedNow(new Date(), timezone).dayKey;
  const mapUrl = context.config.contact.mapEmbedUrl;

  return (
    <SectionShell tone="paper">
      <SectionHeading eyebrow="Visit" title={section.title} subtitle={section.subtitle} />
      <ul className={cn("section-body grid grid-cols-[minmax(0,1fr)] gap-x-14 gap-y-10", locations.length > 1 && "md:grid-cols-2")}>
        {locations.map((location) => {
          const hours = formatHours(location.hours, today);
          const status = serviceStatus(location.hours, new Date(), timezone);
          return (
            <li key={location.id} className="flex flex-col border-t border-[var(--rule-strong)] pt-8">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                <h3 className="display-2">{location.name}</h3>
                <p className="flex items-center gap-2 text-[13px] font-semibold">
                  <span
                    aria-hidden
                    className={cn(
                      "size-2 rounded-full",
                      status.state === "open"
                        ? "bg-[var(--color-success)]"
                        : status.state === "closing"
                          ? "bg-[var(--color-warning)]"
                          : "bg-[var(--rule-strong)]",
                    )}
                  />
                  {status.headline}
                  {status.detail ? <span className="font-normal text-[var(--color-muted-ink)]">{status.detail}</span> : null}
                </p>
              </div>
              <p className="mt-4 flex items-start gap-2.5 text-[14.5px] text-[var(--color-muted-ink)]">
                <MapPin className="mt-0.5 size-4 shrink-0 text-[var(--color-brand-accent)]" aria-hidden />
                <span>{[location.addressLine1, location.addressLine2, location.area, location.city].filter(Boolean).join(", ")}</span>
              </p>
              {location.phone ? (
                <p className="mt-2 flex items-center gap-2.5 text-[14.5px]">
                  <Phone className="size-4 text-[var(--color-brand-accent)]" aria-hidden />
                  <a href={`tel:${location.phone.replace(/\s+/g, "")}`} className="transition-colors hover:text-[var(--color-brand)]">
                    {location.phone}
                  </a>
                </p>
              ) : null}

              <dl className="mt-7 grid max-w-sm grid-cols-[auto_minmax(0,1fr)] gap-x-8 gap-y-2 text-[13.5px]">
                {hours.map((row) => (
                  <div
                    key={row.day}
                    className={cn("contents", row.isToday ? "font-semibold text-[var(--color-ink)]" : "text-[var(--color-muted-ink)]")}
                  >
                    <dt>{row.label}</dt>
                    <dd className="tabular text-right">{row.text || "Closed"}</dd>
                  </div>
                ))}
              </dl>

              {section.showMap && location.latitude && location.longitude ? (
                <a
                  className="link-arrow mt-8"
                  href={mapUrl ?? `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Get directions
                  <ArrowUpRight aria-hidden />
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
    </SectionShell>
  );
}
