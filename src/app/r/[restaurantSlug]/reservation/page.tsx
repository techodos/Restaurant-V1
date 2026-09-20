import type { Metadata } from "next";
import { CalendarX, Clock, Phone, Users } from "lucide-react";
import { getStorefrontCustomer } from "@/web/session";
import { getStorefrontContext, requireStorefront } from "@/web/storefront";
import { isOpenAt, minutesToTime, timeToMinutes, zonedNow } from "@/shared/hours";
import { ReservationForm } from "@/components/storefront/reservation-form";
import { Button } from "@/components/ui/button";
import { JsonLd } from "@/components/storefront/json-ld";
import { breadcrumbJsonLd } from "@/web/seo";
import { getLocations } from "@/server/services/restaurants";
import { getBookedSlots } from "@/server/services/reservations";

interface ReservationPageProps {
  params: Promise<{ restaurantSlug: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: ReservationPageProps): Promise<Metadata> {
  const { restaurantSlug } = await params;
  try {
    const { restaurant } = await getStorefrontContext(restaurantSlug);
    return {
      title: "Book a table",
      description: `Reserve a table at ${restaurant.name}. Live availability, instant confirmation.`,
      alternates: { canonical: `/r/${restaurant.slug}/reservation` },
    };
  } catch {
    return { title: "Book a table" };
  }
}

/**
 * Booking page. Slot availability is computed from the restaurant's real
 * opening hours and table inventory, not from a hardcoded timetable.
 */
export default async function ReservationPage({ params }: ReservationPageProps) {
  const { restaurantSlug } = await params;

  const context = await requireStorefront(restaurantSlug);

  const { restaurant } = context;
  const settings = restaurant.settings.reservations;

  if (!restaurant.features.reservations || !settings.enabled) {
    return (
      <div className="container-page py-20">
        <div className="mx-auto max-w-lg text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-ink)_8%,transparent)] text-[var(--color-muted-ink)]">
            <CalendarX className="size-6" aria-hidden />
          </span>
          <h1 className="mt-6 text-2xl font-semibold">Online reservations are closed</h1>
          <p className="mt-3 text-[var(--color-muted-ink)]">
            {restaurant.name} is not taking bookings through the website right now.
            {restaurant.phone ? " You can still call us and we will find you a table." : ""}
          </p>
          {restaurant.phone ? (
            <div className="mt-6">
              <Button asChild>
                <a href={`tel:${restaurant.phone.replace(/\s+/g, "")}`}>
                  <Phone aria-hidden />
                  {restaurant.phone}
                </a>
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  const locations = (await getLocations(restaurant.id)).filter((location) => location.isActive);

  // Build the bookable window: today + maxAdvanceDays, only keeping open days.
  const today = zonedNow(new Date(), restaurant.timezone);
  const dates: { value: string; label: string }[] = [];
  const slotsByDate: Record<string, Record<string, { booked: number; capacity: number }>> = {};

  for (let offset = 0; offset <= settings.maxAdvanceDays; offset += 1) {
    const day = zonedNow(new Date(Date.now() + offset * 86_400_000), restaurant.timezone);
    const label = new Date(`${day.dateKey}T12:00:00Z`).toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    dates.push({ value: day.dateKey, label: offset === 0 ? `Today · ${label}` : label });

    for (const location of locations) {
      const key = `${location.id}:${day.dateKey}`;
      const windows = location.hours[day.dayKey] ?? [];
      if (!windows.length) {
        slotsByDate[key] = {};
        continue;
      }

      const booked = await getBookedSlots(restaurant.id, location.id, day.dateKey);
      const bookedByTime = new Map<string, number>();
      for (const entry of booked) {
        const slot = entry.time.slice(0, 5);
        bookedByTime.set(slot, (bookedByTime.get(slot) ?? 0) + 1);
      }

      const capacity = settings.tables.length || Math.max(1, Math.floor(settings.maxGuests / 2));
      const slots: Record<string, { booked: number; capacity: number }> = {};
      for (const window of windows) {
        const open = timeToMinutes(window.open);
        const close = timeToMinutes(window.close);
        const lastSeating = close > open ? close - 60 : close + 24 * 60 - 60;
        for (let minute = open; minute <= lastSeating; minute += settings.slotMinutes) {
          const time = minutesToTime(minute % (24 * 60));
          const probe = new Date(`${day.dateKey}T${time}:00Z`);
          if (!isOpenAt(location.hours, probe, restaurant.timezone)) continue;
          if (offset === 0 && minute <= today.minutes) continue; // already passed today
          slots[time] = { booked: bookedByTime.get(time) ?? 0, capacity };
        }
      }
      slotsByDate[key] = slots;
    }
  }

  const customer = await getStorefrontCustomer(restaurant.id).catch(() => null);
  const defaultDate = dates[0]?.value ?? today.dateKey;

  return (
    <div className="container-page py-10 md:py-14">
      <JsonLd
        data={breadcrumbJsonLd([
          { name: restaurant.name, path: `/r/${restaurant.slug}` },
          { name: "Reservations", path: `/r/${restaurant.slug}/reservation` },
        ])}
      />

      <div className="grid gap-10 lg:grid-cols-[1.5fr_1fr] lg:gap-14">
        <div>
          <h1 className="text-3xl font-semibold md:text-4xl">Book a table at {restaurant.name}</h1>
          <p className="mt-3 max-w-xl text-[var(--color-muted-ink)]">
            Choose a time below — you will get a confirmation code immediately
            {settings.autoConfirm ? "" : " and a call if we need to adjust anything"}.
          </p>

          <div className="mt-8">
            <ReservationForm
              restaurantSlug={restaurant.slug}
              locations={locations.map((location) => ({
                id: location.id,
                name: location.name,
                area: location.area,
                city: location.city,
              }))}
              dates={dates}
              slotsByDate={slotsByDate}
              minGuests={settings.minGuests}
              maxGuests={settings.maxGuests}
              slotMinutes={settings.slotMinutes}
              defaultDate={defaultDate}
              customerDefaults={customer ? { fullName: customer.name, phone: "", email: "" } : null}
            />
          </div>
        </div>

        <aside className="space-y-5">
          <div className="rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-6">
            <h2 className="text-base font-semibold">Good to know</h2>
            <ul className="mt-3 space-y-3 text-sm text-[var(--color-muted-ink)]">
              <li className="flex gap-2">
                <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
                Tables are held for 15 minutes after your booking time.
              </li>
              <li className="flex gap-2">
                <Users className="mt-0.5 size-4 shrink-0" aria-hidden />
                Online bookings take {settings.minGuests}–{settings.maxGuests} guests; call for larger parties.
              </li>
              <li className="flex gap-2">
                <CalendarX className="mt-0.5 size-4 shrink-0" aria-hidden />
                Need to cancel? Call us and we will release the table for someone else.
              </li>
            </ul>
          </div>

          {restaurant.phone ? (
            <div className="rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-6">
              <h2 className="text-base font-semibold">Prefer to talk to us?</h2>
              <p className="mt-2 text-sm text-[var(--color-muted-ink)]">
                Our team answers the phone during service hours.
              </p>
              <Button asChild variant="outline" className="mt-4 w-full">
                <a href={`tel:${restaurant.phone.replace(/\s+/g, "")}`}>
                  <Phone aria-hidden />
                  {restaurant.phone}
                </a>
              </Button>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
