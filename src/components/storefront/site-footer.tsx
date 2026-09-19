import Link from "next/link";
import { Clock, Mail, MapPin, Phone } from "lucide-react";
import type { Restaurant, RestaurantLocation } from "@/lib/contract/models";
import { formatHours } from "@/lib/hours";
import { zonedNow } from "@/lib/hours";
import type { WebsiteConfig } from "@/lib/contract/settings";

interface SiteFooterProps {
  restaurant: Restaurant;
  config: WebsiteConfig;
  locations: RestaurantLocation[];
  primaryLocation: RestaurantLocation | null;
}

/** Footer links, tagline and social handles are all database-driven. */
export function SiteFooter({ restaurant, config, locations, primaryLocation }: SiteFooterProps) {
  const footer = config.footer;
  const social = Object.entries(config.social).filter(([, value]) => Boolean(value)) as [string, string][];
  const today = zonedNow(new Date(), restaurant.timezone).dayKey;
  const todayHours = primaryLocation
    ? formatHours(primaryLocation.hours, today).find((row) => row.isToday && Boolean(row.text))
    : undefined;

  return (
    <footer className="mt-20 border-t border-[var(--color-hairline)] bg-[var(--color-surface)]">
      <div className="container-page grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <p className="font-[family-name:var(--font-heading)] text-xl font-semibold">{restaurant.name}</p>
          {footer.tagline ? <p className="text-sm text-[var(--color-muted-ink)]">{footer.tagline}</p> : null}
          {social.length ? (
            <ul className="flex flex-wrap gap-3 pt-1 text-sm">
              {social.map(([network, url]) => (
                <li key={network}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-[var(--color-muted-ink)] underline-offset-4 hover:text-[var(--color-brand)] hover:underline"
                  >
                    {network === "x" ? "X" : network.charAt(0).toUpperCase() + network.slice(1)}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        {footer.columns.map((column) => (
          <div key={column.title} className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted-ink)]">{column.title}</p>
            <ul className="space-y-2 text-sm">
              {column.links.map((link) => (
                <li key={`${column.title}-${link.href}-${link.label}`}>
                  <Link href={link.href} className="hover:text-[var(--color-brand)]">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="space-y-3">
          <p className="text-sm font-semibold uppercase tracking-wider text-[var(--color-muted-ink)]">Visit us</p>
          {primaryLocation ? (
            <address className="space-y-2 text-sm not-italic text-[var(--color-muted-ink)]">
              <span className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  {[primaryLocation.addressLine1, primaryLocation.area, primaryLocation.city].filter(Boolean).join(", ")}
                </span>
              </span>
              {todayHours?.text ? (
                <span className="flex items-start gap-2">
                  <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>Today {todayHours.text}</span>
                </span>
              ) : null}
            </address>
          ) : null}
          <div className="space-y-2 text-sm">
            {restaurant.phone ? (
              <a href={`tel:${restaurant.phone.replace(/\s+/g, "")}`} className="flex items-center gap-2 hover:text-[var(--color-brand)]">
                <Phone className="size-4" aria-hidden />
                {restaurant.phone}
              </a>
            ) : null}
            {(config.contact.email ?? restaurant.email) ? (
              <a
                href={`mailto:${config.contact.email ?? restaurant.email}`}
                className="flex items-center gap-2 hover:text-[var(--color-brand)]"
              >
                <Mail className="size-4" aria-hidden />
                {config.contact.email ?? restaurant.email}
              </a>
            ) : null}
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--color-hairline)]">
        <div className="container-page flex flex-col gap-2 py-6 text-xs text-[var(--color-muted-ink)] sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {new Date().getFullYear()} {restaurant.legalName ?? restaurant.name}. All rights reserved.
          </p>
          <p>{footer.legalNote ?? `${locations.length} location${locations.length === 1 ? "" : "s"} in ${restaurant.country}`}</p>
        </div>
      </div>
    </footer>
  );
}
