import Link from "next/link";
import { ArrowUpRight, Clock, Facebook, Instagram, Mail, MapPin, Phone, Twitter, Youtube } from "lucide-react";
import type { Restaurant, RestaurantLocation } from "@/shared/contract/models";
import { formatHours, zonedNow } from "@/shared/hours";
import type { WebsiteConfig } from "@/shared/contract/settings";

interface SiteFooterProps {
  restaurant: Restaurant;
  config: WebsiteConfig;
  locations: RestaurantLocation[];
  primaryLocation: RestaurantLocation | null;
}

const SOCIAL_ICONS: Record<string, typeof Facebook> = {
  facebook: Facebook,
  instagram: Instagram,
  x: Twitter,
  twitter: Twitter,
  youtube: Youtube,
};

/** The close of every page, on the night surface. Links, tagline, social handles and hours come from the database. */
export function SiteFooter({ restaurant, config, locations, primaryLocation }: SiteFooterProps) {
  const footer = config.footer;
  const social = Object.entries(config.social).filter(([, value]) => Boolean(value)) as [string, string][];
  const today = zonedNow(new Date(), restaurant.timezone).dayKey;
  const todayHours = primaryLocation
    ? formatHours(primaryLocation.hours, today).find((row) => row.isToday && Boolean(row.text))
    : undefined;
  const email = config.contact.email ?? restaurant.email;

  return (
    <footer className="tone-night border-t border-[var(--rule)]">
      <div className="container-page grid grid-cols-[minmax(0,1fr)] gap-10 py-12 md:py-14 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)] lg:gap-14">
        <div className="max-w-sm">
          <p className="font-[family-name:var(--font-display)] text-[2.25rem] leading-none tracking-[0.005em]">{restaurant.name}</p>
          {footer.tagline ? <p className="mt-4 text-[15px] leading-relaxed text-[var(--color-muted-ink)]">{footer.tagline}</p> : null}
          {social.length ? (
            <ul className="mt-5 flex flex-wrap gap-2">
              {social.map(([network, url]) => {
                const Icon = SOCIAL_ICONS[network] ?? ArrowUpRight;
                const label = network === "x" ? "X" : network.charAt(0).toUpperCase() + network.slice(1);
                return (
                  <li key={network}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label={label}
                      title={label}
                      className="press grid size-10 place-items-center rounded-full border border-[var(--rule-strong)] text-[var(--color-muted-ink)] transition-colors duration-200 hover:border-[var(--color-brand-accent)] hover:text-[var(--color-ink)]"
                    >
                      <Icon className="size-4" aria-hidden />
                    </a>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-x-8 gap-y-8 md:grid-cols-3">
          {footer.columns.map((column) => (
            <div key={column.title}>
              <p className="eyebrow">{column.title}</p>
              <ul className="mt-4 space-y-2.5 text-[14.5px]">
                {column.links.map((link) => (
                  <li key={`${column.title}-${link.href}-${link.label}`}>
                    <Link href={link.href} className="text-[var(--color-muted-ink)] transition-colors hover:text-[var(--color-ink)]">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="col-span-2 md:col-span-1">
            <p className="eyebrow">Visit us</p>
            <address className="mt-4 space-y-3 text-[14.5px] not-italic text-[var(--color-muted-ink)]">
              {primaryLocation ? (
                <span className="flex items-start gap-3">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-[var(--color-brand-accent)]" aria-hidden />
                  <span>{[primaryLocation.addressLine1, primaryLocation.area, primaryLocation.city].filter(Boolean).join(", ")}</span>
                </span>
              ) : null}
              {todayHours?.text ? (
                <span className="flex items-start gap-3">
                  <Clock className="mt-0.5 size-4 shrink-0 text-[var(--color-brand-accent)]" aria-hidden />
                  <span>Today · {todayHours.text}</span>
                </span>
              ) : null}
              {restaurant.phone ? (
                <a href={`tel:${restaurant.phone.replace(/\s+/g, "")}`} className="flex items-center gap-3 transition-colors hover:text-[var(--color-ink)]">
                  <Phone className="size-4 shrink-0 text-[var(--color-brand-accent)]" aria-hidden />
                  {restaurant.phone}
                </a>
              ) : null}
              {email ? (
                <a href={`mailto:${email}`} className="flex items-center gap-3 break-all transition-colors hover:text-[var(--color-ink)]">
                  <Mail className="size-4 shrink-0 text-[var(--color-brand-accent)]" aria-hidden />
                  {email}
                </a>
              ) : null}
            </address>
          </div>
        </div>
      </div>

      <div className="border-t border-[var(--rule)]">
        <div className="container-page flex flex-col gap-2 py-6 pb-[calc(1.5rem+4.5rem+env(safe-area-inset-bottom))] text-xs text-[var(--color-muted-ink)] sm:flex-row sm:items-center sm:justify-between md:pb-6">
          <p>
            © {new Date().getFullYear()} {restaurant.legalName ?? restaurant.name}. All rights reserved.
          </p>
          <p>{footer.legalNote ?? `${locations.length} location${locations.length === 1 ? "" : "s"} in ${restaurant.country}`}</p>
        </div>
      </div>
    </footer>
  );
}
