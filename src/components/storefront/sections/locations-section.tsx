import { Clock, MapPin, Phone } from "lucide-react";
import type { StorefrontContext } from "@/shared/contract/models";
import type { LocationsSection as LocationsConfig } from "@/shared/contract/sections";
import { formatHours, zonedNow } from "@/shared/hours";
import { SectionHeading } from "@/components/storefront/section-heading";
import { SectionShell } from "@/components/storefront/section-shell";
import { getLocations } from "@/server/services/restaurants";

export async function LocationsSection({ section, context }: { section: LocationsConfig; context: StorefrontContext }) {
  const locations = (await getLocations(context.restaurant.id))
    .filter((location) => location.isActive)
    .slice(0, section.limit);

  if (!locations.length) return null;
  const today = zonedNow(new Date(), context.restaurant.timezone).dayKey;
  const mapUrl = context.config.contact.mapEmbedUrl;

  return (
    <SectionShell tone="surface">
      <SectionHeading title={section.title} subtitle={section.subtitle} />
      <ul className="mt-10 grid gap-5 md:grid-cols-2">
        {locations.map((location) => {
          const hours = formatHours(location.hours, today);
          const todayRow = hours.find((row) => row.isToday);
          return (
            <li
              key={location.id}
              className="flex flex-col gap-4 rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-6"
            >
              <div>
                <h3 className="text-lg font-semibold">{location.name}</h3>
                <p className="mt-2 flex items-start gap-2 text-sm text-[var(--color-muted-ink)]">
                  <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    {[location.addressLine1, location.addressLine2, location.area, location.city]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                </p>
                {location.phone ? (
                  <p className="mt-1.5 flex items-center gap-2 text-sm">
                    <Phone className="size-4 text-[var(--color-muted-ink)]" aria-hidden />
                    <a href={`tel:${location.phone.replace(/\s+/g, "")}`} className="hover:text-[var(--color-brand)]">
                      {location.phone}
                    </a>
                  </p>
                ) : null}
              </div>

              <div className="flex items-start gap-2 text-sm">
                <Clock className="mt-0.5 size-4 shrink-0 text-[var(--color-muted-ink)]" aria-hidden />
                <div>
                  <p className="font-medium">Today {todayRow?.text ?? "Closed"}</p>
                  <details className="mt-1 text-[var(--color-muted-ink)]">
                    <summary className="cursor-pointer text-xs underline-offset-2 hover:underline">All opening hours</summary>
                    <ul className="mt-2 space-y-1 text-xs">
                      {hours.map((row) => (
                        <li key={row.day} className="flex justify-between gap-4">
                          <span>{row.label}</span>
                          <span>{row.text || "Closed"}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </div>
              </div>

              {section.showMap && location.latitude && location.longitude ? (
                <a
                  className="text-sm font-medium text-[var(--color-brand)] underline-offset-4 hover:underline"
                  href={mapUrl ?? `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  Open in maps →
                </a>
              ) : null}
            </li>
          );
        })}
      </ul>
    </SectionShell>
  );
}
