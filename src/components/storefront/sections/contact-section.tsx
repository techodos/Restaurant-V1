import { Clock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import type { StorefrontContext } from "@/lib/contract/models";
import type { ContactSection as ContactConfig } from "@/lib/contract/sections";
import { formatHours, zonedNow } from "@/lib/hours";
import { SectionHeading } from "../section-heading";
import { SectionShell } from "../section-shell";
import { ContactForm } from "../contact-form";

export function ContactSection({ section, context }: { section: ContactConfig; context: StorefrontContext }) {
  const { restaurant, primaryLocation, config } = context;
  const email = section.email ?? config.contact.email ?? restaurant.email;
  const phone = section.phone ?? primaryLocation?.phone ?? restaurant.phone;
  const today = zonedNow(new Date(), restaurant.timezone).dayKey;
  const todayRow = primaryLocation ? formatHours(primaryLocation.hours, today).find((row) => row.isToday) : undefined;
  const whatsapp = restaurant.whatsapp;

  return (
    <SectionShell>
      <SectionHeading title={section.title} subtitle={section.subtitle} />
      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        <ul className="space-y-5">
          {primaryLocation ? (
            <li className="flex gap-3">
              <MapPin className="mt-0.5 size-5 shrink-0 text-[var(--color-brand)]" aria-hidden />
              <div>
                <p className="font-medium">{primaryLocation.name}</p>
                <p className="text-sm text-[var(--color-muted-ink)]">
                  {[primaryLocation.addressLine1, primaryLocation.area, primaryLocation.city].filter(Boolean).join(", ")}
                </p>
              </div>
            </li>
          ) : null}
          {phone ? (
            <li className="flex gap-3">
              <Phone className="mt-0.5 size-5 shrink-0 text-[var(--color-brand)]" aria-hidden />
              <div>
                <p className="font-medium">Call us</p>
                <a href={`tel:${phone.replace(/\s+/g, "")}`} className="text-sm text-[var(--color-muted-ink)] hover:text-[var(--color-brand)]">
                  {phone}
                </a>
              </div>
            </li>
          ) : null}
          {whatsapp && config.contact.showWhatsapp ? (
            <li className="flex gap-3">
              <MessageCircle className="mt-0.5 size-5 shrink-0 text-[var(--color-brand)]" aria-hidden />
              <div>
                <p className="font-medium">WhatsApp</p>
                <a
                  href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-sm text-[var(--color-muted-ink)] hover:text-[var(--color-brand)]"
                >
                  Message the restaurant
                </a>
              </div>
            </li>
          ) : null}
          {email ? (
            <li className="flex gap-3">
              <Mail className="mt-0.5 size-5 shrink-0 text-[var(--color-brand)]" aria-hidden />
              <div>
                <p className="font-medium">Email</p>
                <a href={`mailto:${email}`} className="text-sm text-[var(--color-muted-ink)] hover:text-[var(--color-brand)]">
                  {email}
                </a>
              </div>
            </li>
          ) : null}
          {todayRow ? (
            <li className="flex gap-3">
              <Clock className="mt-0.5 size-5 shrink-0 text-[var(--color-brand)]" aria-hidden />
              <div>
                <p className="font-medium">Opening hours</p>
                <p className="text-sm text-[var(--color-muted-ink)]">Today {todayRow.text || "closed"}</p>
              </div>
            </li>
          ) : null}
        </ul>

        {section.showForm ? (
          <ContactForm restaurantSlug={restaurant.slug} restaurantName={restaurant.name} />
        ) : (
          <div className="rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-6">
            <p className="text-sm text-[var(--color-muted-ink)]">
              Questions about a large order, catering or a recent visit? Call us during service hours and we will sort it
              out quickly.
            </p>
          </div>
        )}
      </div>
    </SectionShell>
  );
}
