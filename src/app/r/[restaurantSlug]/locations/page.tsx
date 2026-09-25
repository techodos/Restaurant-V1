import type { Metadata } from "next";
import { ConfiguredPage, configuredPageMetadata, type PageHeading } from "@/components/storefront/configured-page";
import type { StorefrontContext } from "@/shared/contract/models";
import { Clock, Mail, MapPin, Phone } from "lucide-react";
import { getStorefrontContext } from "@/web/storefront";
import { formatHours, zonedNow } from "@/shared/hours";
import { breadcrumbJsonLd, restaurantJsonLd } from "@/web/seo";
import { JsonLd } from "@/components/storefront/json-ld";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getDeliveryZones, getLocations } from "@/server/services/restaurants";

interface LocationsPageProps {
  params: Promise<{ restaurantSlug: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: LocationsPageProps): Promise<Metadata> {
  const { restaurantSlug } = await params;
  try {
    const { restaurant } = await getStorefrontContext(restaurantSlug);
    return {
      ...(await configuredPageMetadata(restaurant.id, "locations", {
        title: "Locations",
        description: `Addresses, opening hours and phone numbers for ${restaurant.name}.`,
      })),
      alternates: { canonical: `/r/${restaurant.slug}/locations` },
    };
  } catch {
    return { title: "Locations" };
  }
}

export default async function LocationsPage({ params }: LocationsPageProps) {
  const { restaurantSlug } = await params;
  return <ConfiguredPage restaurantSlug={restaurantSlug} pageSlug="locations" render={renderLocations} />;
}

async function renderLocations(context: StorefrontContext, heading: PageHeading) {
  const { restaurant } = context;
  const [allLocations, zones] = await Promise.all([
    getLocations(restaurant.id),
    getDeliveryZones(restaurant.id, { activeOnly: true }),
  ]);
  const locations = allLocations.filter((location) => location.isActive);
  const today = zonedNow(new Date(), restaurant.timezone).dayKey;

  return (
    <div className="container-page py-10 md:py-14">
      <JsonLd data={restaurantJsonLd(restaurant, context.primaryLocation)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: restaurant.name, path: `/r/${restaurant.slug}` },
          { name: "Locations", path: `/r/${restaurant.slug}/locations` },
        ])}
      />

      <header className="max-w-2xl">
        <h1 className="text-[2.25rem] font-semibold leading-[1.05] md:text-[3.25rem]">{heading.title ?? "Find us"}</h1>
        <p className="mt-3 text-[var(--color-muted-ink)]">
          {heading.subtitle ??
            `${locations.length} kitchen${locations.length === 1 ? "" : "s"} in ${restaurant.country}. Delivery zones and hours differ per location.`}
        </p>
      </header>

      <ul className="mt-10 grid gap-6 lg:grid-cols-2">
        {locations.map((location) => {
          const hours = formatHours(location.hours, today);
          const todayRow = hours.find((row) => row.isToday);
          const phone = location.phone ?? restaurant.phone;
          const mapHref =
            location.latitude && location.longitude
              ? `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`
              : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  [location.addressLine1, location.area, location.city].filter(Boolean).join(", "),
                )}`;

          return (
            <li
              key={location.id}
              className="flex flex-col gap-5 surface-flat p-6"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold">{location.name}</h2>
                {location.isPrimary ? <Badge variant="soft">Flagship</Badge> : null}
                {todayRow ? (
                  <Badge variant="neutral">Today {todayRow.text || "closed"}</Badge>
                ) : null}
              </div>

              <div className="space-y-2 text-sm text-[var(--color-muted-ink)]">
                <p className="flex items-start gap-2">
                  <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    {[location.addressLine1, location.addressLine2, location.area, location.city, location.postalCode]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                </p>
                {phone ? (
                  <p className="flex items-center gap-2">
                    <Phone className="size-4 shrink-0" aria-hidden />
                    <a href={`tel:${phone.replace(/\s+/g, "")}`} className="hover:text-[var(--color-brand)]">
                      {phone}
                    </a>
                  </p>
                ) : null}
                {location.email ? (
                  <p className="flex items-center gap-2">
                    <Mail className="size-4 shrink-0" aria-hidden />
                    <a href={`mailto:${location.email}`} className="hover:text-[var(--color-brand)]">
                      {location.email}
                    </a>
                  </p>
                ) : null}
              </div>

              <details className="rounded-[var(--radius-brand)] border border-[var(--color-hairline)] p-4">
                <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <Clock className="size-4" aria-hidden />
                  Opening hours
                </summary>
                <ul className="mt-3 space-y-1.5 text-sm">
                  {hours.map((row) => (
                    <li key={row.day} className="flex justify-between gap-4">
                      <span className={row.isToday ? "font-medium" : "text-[var(--color-muted-ink)]"}>{row.label}</span>
                      <span className={row.isToday ? "font-medium" : "text-[var(--color-muted-ink)]"}>
                        {row.text || "Closed"}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>

              <div className="flex flex-wrap gap-3">
                <Button asChild variant="outline" size="sm">
                  <a href={mapHref} target="_blank" rel="noreferrer noopener">
                    <MapPin aria-hidden />
                    Directions
                  </a>
                </Button>
                {restaurant.features.pickup ? (
                  <Button asChild size="sm">
                    <a href={`/r/${restaurant.slug}/menu?orderType=pickup`}>Order for pickup</a>
                  </Button>
                ) : null}
                {restaurant.features.delivery && zones.some((zone) => zone.locationId === location.id) ? (
                  <Button asChild size="sm" variant="secondary">
                    <a href={`/r/${restaurant.slug}/menu?orderType=delivery`}>Order delivery</a>
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
