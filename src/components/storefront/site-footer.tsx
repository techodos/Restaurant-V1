import Link from "next/link";
import { Clock, Mail, MapPin, Phone } from "lucide-react";
import type { Restaurant, RestaurantLocation } from "@/shared/contract/models";
import { formatHours } from "@/shared/hours";
import { zonedNow } from "@/shared/hours";
import type { WebsiteConfig } from "@/shared/contract/settings";

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
  const email = config.contact.email ?? restaurant.email;

  return (
    <footer className="mt-16 border-t border-[var(--color-hairline)] bg-[var(--color-surface)] md:mt-24">
      <div className="container-page grid gap-12 py-14 md:py-20 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)] lg:gap-16">
        <div className="max-w-sm">
          <p className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-[-0.02em]">{restaurant.name}</p>
          {footer.tagline ? (
            <p className="mt-3 text-[15px] leading-relaxed text-[var(--color-muted-ink)]">{footer.tagline}</p>
          ) : null}
          {social.length ? (
            <ul className="mt-6 flex flex-wrap gap-2">
              {social.map(([network, url]) => (
                <li key={network}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex h-9 items-center rounded-full border border-[var(--color-hairline)] px-3.5 text-[13px] font-medium transition-colors hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]"
                  >
                    {network === "x" ? "X" : network.charAt(0).toUpperCase() + network.slice(1)}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-3">
          {footer.columns.map((column) => (
            <div key={column.title}>
              <p className="text-[13px] font-semibold text-[var(--color-ink)]">{column.title}</p>
              <ul className="mt-4 space-y-2.5 text-sm">
                {column.links.map((link) => (
                  <li key={`${column.title}-${link.href}-${link.label}`}>
                    <Link
                      href={link.href}
                      className="text-[var(--color-muted-ink)] transition-colors hover:text-[var(--color-ink)]"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <p className="text-[13px] font-semibold text-[var(--color-ink)]">Visit us</p>
            <address className="mt-4 space-y-3 text-sm not-italic text-[var(--color-muted-ink)]">
              {primaryLocation ? (
                <span className="flex items-start gap-2.5">
                  <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    {[primaryLocation.addressLine1, primaryLocation.area, primaryLocation.city].filter(Boolean).join(", ")}
                  </span>
                </span>
              ) : null}
              {todayHours?.text ? (
                <span className="flex items-start gap-2.5">
                  <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>Today {todayHours.text}</span>
                </span>
              ) : null}
              {restaurant.phone ? (
                <a
                  href={`tel:${restaurant.phone.replace(/\s+/g, "")}`}
                  className="flex items-center gap-2.5 transition-colors hover:text-[var(--color-ink)]"
                >
                  <Phone className="size-4 shrink-0" aria-hidden />
                  {restaurant.phone}
                </a>
              ) : null}
              {email ? (
                <a href={`mailto:${email}`} className="flex items-center gap-2.5 break-all transition-colors hover:text-[var(--color-ink)]">
                  <Mail className="size-4 shrink-0" aria-hidden />
                  {email}
                </a>
              ) : null}
            </address>
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
