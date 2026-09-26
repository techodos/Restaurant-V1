import type { Metadata } from "next";
import { ConfiguredPage, configuredPageMetadata, type PageHeading } from "@/components/storefront/configured-page";
import type { StorefrontContext } from "@/shared/contract/models";
import { ArrowUpRight, Mail, MapPin, Phone } from "lucide-react";
import { getStorefrontContext } from "@/web/storefront";
import { formatHours, zonedNow } from "@/shared/hours";
import { breadcrumbJsonLd, restaurantJsonLd } from "@/web/seo";
import { JsonLd } from "@/components/storefront/json-ld";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getDeliveryZones, getLocations } from "@/server/services/restaurants";
import { PageHero } from "@/components/storefront/page-hero";
import { serviceStatus } from "@/components/storefront/service-status";
import { resolveImage } from "@/web/media";
import { cn } from "@/shared/utils";

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

  const now = new Date();

  return (
    <>
      <JsonLd data={restaurantJsonLd(restaurant, context.primaryLocation)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: restaurant.name, path: `/r/${restaurant.slug}` },
          { name: "Locations", path: `/r/${restaurant.slug}/locations` },
        ])}
      />

      <PageHero
        overlay={heading.leading}
        size="sm"
        image={resolveImage(restaurant.coverUrl)}
        eyebrow="Visit"
        title={heading.title ?? "Find us"}
        subtitle={
          heading.subtitle ??
          `${locations.length} kitchen${locations.length === 1 ? "" : "s"} in ${restaurant.country}. Delivery zones and hours differ per location.`
        }
      />

      {/* one full-width band per kitchen, alternating paper and night */}
      {locations.map((location, index) => {
        const hours = formatHours(location.hours, today);
        const status = serviceStatus(location.hours, now, restaurant.timezone);
        const phone = location.phone ?? restaurant.phone;
        const mapHref =
          location.latitude && location.longitude
            ? `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`
            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                [location.addressLine1, location.area, location.city].filter(Boolean).join(", "),
              )}`;
        const night = index % 2 === 1;

        return (
          <section key={location.id} className={cn(night ? "tone-night" : "tone-paper", "section-y")} aria-labelledby={`loc-${location.id}`}>
            <div className="container-page grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-14">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="tabular font-[family-name:var(--font-display)] text-[1.4rem] text-[var(--color-brand-accent)]">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  {location.isPrimary ? <Badge variant="soft">Flagship</Badge> : null}
                  <span className="inline-flex items-center gap-2 text-[13px] font-semibold">
                    <span
                      aria-hidden
                      className={cn(
                        "size-2 rounded-full",
                        status.state === "open" ? "bg-[var(--color-success)]" : status.state === "closing" ? "bg-[var(--color-warning)]" : "bg-[var(--rule-strong)]",
                      )}
                    />
                    {status.headline}
                    {status.detail ? <span className="font-normal text-[var(--color-muted-ink)]">{status.detail}</span> : null}
                  </span>
                </div>
                <h2 id={`loc-${location.id}`} className="display-1 mt-4">
                  {location.name}
                </h2>

                <ul className="mt-6 space-y-2.5 text-[15px]">
                  <li className="flex items-start gap-3">
                    <MapPin className="mt-1 size-4 shrink-0 text-[var(--color-brand-accent)]" aria-hidden />
                    <span>
                      {[location.addressLine1, location.addressLine2, location.area, location.city, location.postalCode].filter(Boolean).join(", ")}
                    </span>
                  </li>
                  {phone ? (
                    <li className="flex items-center gap-3">
                      <Phone className="size-4 shrink-0 text-[var(--color-brand-accent)]" aria-hidden />
                      <a href={`tel:${phone.replace(/\s+/g, "")}`} className="underline-offset-4 hover:underline">
                        {phone}
                      </a>
                    </li>
                  ) : null}
                  {location.email ? (
                    <li className="flex items-center gap-3">
                      <Mail className="size-4 shrink-0 text-[var(--color-brand-accent)]" aria-hidden />
                      <a href={`mailto:${location.email}`} className="underline-offset-4 hover:underline">
                        {location.email}
                      </a>
                    </li>
                  ) : null}
                </ul>

                <div className="mt-8 flex flex-wrap gap-3">
                  {restaurant.features.pickup ? (
                    <Button asChild size="lg">
                      <a href={`/r/${restaurant.slug}/menu?orderType=pickup`}>Order for pickup</a>
                    </Button>
                  ) : null}
                  {restaurant.features.delivery && zones.some((zone) => zone.locationId === location.id) ? (
                    <Button asChild size="lg" variant="outline">
                      <a href={`/r/${restaurant.slug}/menu?orderType=delivery`}>Order delivery</a>
                    </Button>
                  ) : null}
                  <Button asChild size="lg" variant="ghost">
                    <a href={mapHref} target="_blank" rel="noreferrer noopener">
                      Directions
                      <ArrowUpRight aria-hidden />
                    </a>
                  </Button>
                </div>
              </div>

              <div>
                <p className="eyebrow mb-4">Opening hours</p>
                <table className="w-full text-[14.5px]">
                  <tbody>
                    {hours.map((row) => (
                      <tr key={row.day} className="border-t border-[var(--rule)] last:border-b">
                        <th scope="row" className={cn("py-2.5 text-left", row.isToday ? "font-semibold" : "font-normal text-[var(--color-muted-ink)]")}>
                          {row.label}
                          {row.isToday ? <span className="ml-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-brand-accent)]">Today</span> : null}
                        </th>
                        <td className={cn("tabular py-2.5 text-right", row.isToday ? "font-semibold" : "text-[var(--color-muted-ink)]")}>
                          {row.text || "Closed"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        );
      })}
    </>
  );
}
