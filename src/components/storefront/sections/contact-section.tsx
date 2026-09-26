import { Clock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import type { StorefrontContext } from "@/shared/contract/models";
import type { ContactSection as ContactConfig } from "@/shared/contract/sections";
import { formatHours, zonedNow } from "@/shared/hours";
import { SectionHeading } from "@/components/storefront/section-heading";
import { SectionShell } from "@/components/storefront/section-shell";
import { ContactForm } from "@/components/storefront/contact-form";

/** How to reach the restaurant: heading on one side, a ledger of real contact routes (and the form, when enabled) on the other. */
export function ContactSection({ section, context }: { section: ContactConfig; context: StorefrontContext }) {
  const { restaurant, primaryLocation, config } = context;
  const email = section.email ?? config.contact.email ?? restaurant.email;
  const phone = section.phone ?? primaryLocation?.phone ?? restaurant.phone;
  const today = zonedNow(new Date(), restaurant.timezone).dayKey;
  const todayRow = primaryLocation ? formatHours(primaryLocation.hours, today).find((row) => row.isToday) : undefined;
  const whatsapp = restaurant.whatsapp && config.contact.showWhatsapp ? restaurant.whatsapp : null;

  const routes = [
    primaryLocation
      ? {
          icon: MapPin,
          label: primaryLocation.name,
          value: [primaryLocation.addressLine1, primaryLocation.area, primaryLocation.city].filter(Boolean).join(", "),
          href: null,
        }
      : null,
    phone ? { icon: Phone, label: "Call us", value: phone, href: `tel:${phone.replace(/\s+/g, "")}` } : null,
    whatsapp
      ? { icon: MessageCircle, label: "WhatsApp", value: "Message the restaurant", href: `https://wa.me/${whatsapp.replace(/\D/g, "")}` }
      : null,
    email ? { icon: Mail, label: "Email", value: email, href: `mailto:${email}` } : null,
    todayRow ? { icon: Clock, label: "Opening hours", value: `Today · ${todayRow.text || "Closed"}`, href: null } : null,
  ].filter((route): route is NonNullable<typeof route> => Boolean(route));

  return (
    <SectionShell tone="muted">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-14">
        <SectionHeading eyebrow="Contact" title={section.title} subtitle={section.subtitle} />
        <div className="space-y-8">
          <ul className="grid grid-cols-[minmax(0,1fr)] border-t border-[var(--rule)] sm:grid-cols-2">
            {routes.map(({ icon: Icon, label, value, href }) => (
              <li key={label} className="flex gap-4 border-b border-[var(--rule)] py-6 sm:pr-6">
                <span className="grid size-10 shrink-0 place-items-center rounded-full border border-[var(--rule-strong)] text-[var(--color-brand-accent)]">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted-ink)]">{label}</p>
                  {href ? (
                    <a
                      href={href}
                      {...(href.startsWith("http") ? { target: "_blank", rel: "noreferrer noopener" } : {})}
                      className="mt-1 block break-words text-[15px] font-medium transition-colors hover:text-[var(--color-brand)]"
                    >
                      {value}
                    </a>
                  ) : (
                    <p className="mt-1 text-[15px] font-medium">{value}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {section.showForm ? <ContactForm restaurantSlug={restaurant.slug} restaurantName={restaurant.name} /> : null}
        </div>
      </div>
    </SectionShell>
  );
}
