"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, CalendarCheck, Loader2, MapPin, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/utils";
import { ReservationSuccess } from "./reservation-success";
import { FieldError, FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import { bookTableAction, type BookingResult } from "@/app/r/[restaurantSlug]/reservation/actions";

export interface ReservationSlotOption {
  time: string;
  available: boolean;
}

interface ReservationFormProps {
  restaurantSlug: string;
  locations: { id: string; name: string; area: string | null; city: string | null }[];
  dates: { value: string; label: string }[];
  slotsByDate: Record<string, Record<string, { booked: number; capacity: number }>>;
  minGuests: number;
  maxGuests: number;
  slotMinutes: number;
  defaultDate: string;
  customerDefaults: { fullName: string; phone: string; email: string } | null;
}

/** "2026-09-26" -> weekday / day / month parts, read in UTC because the key is already the restaurant's local date. */
function dayParts(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  const part = (options: Intl.DateTimeFormatOptions) => date.toLocaleDateString(undefined, { timeZone: "UTC", ...options });
  return { weekday: part({ weekday: "short" }), day: part({ day: "numeric" }), month: part({ month: "short" }) };
}

const DAYPARTS = [
  { label: "Morning", until: 12 * 60 },
  { label: "Afternoon", until: 17 * 60 },
  { label: "Evening", until: 24 * 60 },
];

function daypart(time: string) {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  const minute = hours * 60 + minutes;
  return DAYPARTS.find((part) => minute < part.until)!.label;
}

function Step({ index, title, children }: { index: number; title: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-labelledby={`step-${index}`} className="grid grid-cols-[minmax(0,1fr)] gap-5 border-t border-[var(--rule)] pt-7 md:grid-cols-[10rem_minmax(0,1fr)] md:gap-8">
      <p id={`step-${index}`}>
        <span className="flex items-baseline gap-3 md:flex-col md:gap-2">
          <span className="tabular font-[family-name:var(--font-display)] text-[1.9rem] leading-none text-[var(--color-brand-accent)]">
            {String(index).padStart(2, "0")}
          </span>
          <span className="text-[13px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted-ink)]">{title}</span>
        </span>
      </p>
      <div className="min-w-0 space-y-5">{children}</div>
    </div>
  );
}

const chip =
  "press rounded-[var(--radius-control)] border text-sm transition-[background-color,border-color,color] duration-200 focus-visible:outline-offset-2";
const chipIdle =
  "border-[var(--color-hairline)] bg-[var(--color-surface)] hover:border-[color-mix(in_srgb,var(--color-brand)_55%,var(--color-hairline))]";
const chipOn = "border-[var(--color-brand)] bg-[var(--color-brand)] text-[var(--color-brand-foreground)] shadow-[var(--shadow-brand)]";

/**
 * Reservation form, set as three numbered steps (when, time, you). Slot availability shown here is
 * derived from the database (booked vs. configured table capacity) and re-checked atomically by
 * createReservation, so two guests cannot take the same last table. Presentation only: the payload
 * sent to bookTableAction is unchanged.
 */
export function ReservationForm({
  restaurantSlug,
  locations,
  dates,
  slotsByDate,
  minGuests,
  maxGuests,
  slotMinutes,
  defaultDate,
  customerDefaults,
}: ReservationFormProps) {
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState("");
  const [guests, setGuests] = useState(Math.min(Math.max(2, minGuests), maxGuests));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [booking, setBooking] = useState<BookingResult | null>(null);
  const [pending, startTransition] = useTransition();
  const dayStrip = useRef<HTMLDivElement>(null);
  const scrollDays = (direction: 1 | -1) =>
    dayStrip.current?.scrollBy({ left: direction * dayStrip.current.clientWidth * 0.8, behavior: "smooth" });

  const capacity = slotsByDate[`${locationId}:${date}`] ?? {};
  const timeOptions = useMemo(
    () =>
      Object.entries(capacity)
        .map(([slot, info]) => ({ time: slot, available: info.booked < info.capacity }))
        .sort((left, right) => left.time.localeCompare(right.time)),
    [capacity],
  );
  const groups = useMemo(() => {
    const map = new Map<string, ReservationSlotOption[]>();
    for (const option of timeOptions) {
      const key = daypart(option.time);
      map.set(key, [...(map.get(key) ?? []), option]);
    }
    return [...map.entries()];
  }, [timeOptions]);

  const selectedDate = dates.find((option) => option.value === date);
  const location = locations.find((option) => option.id === locationId);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "").trim();

    const payload = {
      locationId,
      date,
      time,
      guests,
      guestName: value("guestName"),
      guestPhone: value("guestPhone"),
      guestEmail: value("guestEmail"),
      occasion: value("occasion"),
      specialRequests: value("specialRequests"),
    };

    const nextErrors: Record<string, string> = {};
    if (!payload.guestName) nextErrors.guestName = "Please tell us who the booking is for.";
    if (!/^[+0-9()\s-]{7,}$/.test(payload.guestPhone)) nextErrors.guestPhone = "We need a phone number to confirm.";
    if (!payload.time) nextErrors.time = "Please choose a time.";
    if (!payload.guestEmail) nextErrors.guestEmail = "Please enter your email so we can confirm.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.guestEmail)) nextErrors.guestEmail = "That email looks incomplete.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      toast.error("Please check the highlighted fields.");
      return;
    }

    startTransition(async () => {
      const result = await bookTableAction(restaurantSlug, payload);
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      setBooking(result.data);
      toast.success(result.data.status === "confirmed" ? "Table confirmed" : "Request submitted", {
        description: `Reference ${result.data.confirmationCode}`,
      });
    });
  }

  // Only reached after bookTableAction succeeded (the reservation is saved); a failure keeps the form.
  if (booking) {
    return <ReservationSuccess restaurantSlug={restaurantSlug} booking={booking} onBookAnother={() => setBooking(null)} />;
  }

  const summary = [selectedDate?.label, time || null, `${guests} guest${guests === 1 ? "" : "s"}`].filter(Boolean).join(" · ");

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-8 pb-24 md:pb-0">
      <Step index={1} title="When">
        {locations.length > 1 ? (
          <div className="space-y-2.5">
            <p id="location-label" className="text-sm font-medium">Location</p>
            <div role="radiogroup" aria-labelledby="location-label" className="grid gap-2 sm:grid-cols-2">
              {locations.map((option) => {
                const on = option.id === locationId;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      setLocationId(option.id);
                      setTime("");
                    }}
                    className={cn(chip, "flex items-center gap-3 rounded-[var(--radius-card)] px-4 py-3 text-left", on ? chipOn : chipIdle)}
                  >
                    <MapPin className="size-4 shrink-0 opacity-80" aria-hidden />
                    <span className="min-w-0">
                      <span className="block font-semibold">{option.name}</span>
                      {option.area || option.city ? (
                        <span className="block truncate text-[12.5px] opacity-75">{[option.area, option.city].filter(Boolean).join(", ")}</span>
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <p id="date-label" className="text-sm font-medium">Date</p>
            <div className="hidden gap-1.5 md:flex">
              {([-1, 1] as const).map((direction) => (
                <button
                  key={direction}
                  type="button"
                  aria-label={direction === 1 ? "Later dates" : "Earlier dates"}
                  onClick={() => scrollDays(direction)}
                  className="press grid size-8 place-items-center rounded-full border border-[var(--color-hairline)] hover:border-[var(--rule-strong)]"
                >
                  {direction === 1 ? <ArrowRight className="size-3.5" aria-hidden /> : <ArrowLeft className="size-3.5" aria-hidden />}
                </button>
              ))}
            </div>
          </div>
          <div
            ref={dayStrip}
            role="radiogroup"
            aria-labelledby="date-label"
            className="scrollbar-none -mx-5 flex snap-x gap-2 overflow-x-auto scroll-px-5 px-5 pb-1 md:mx-0 md:scroll-px-0 md:px-0 md:[mask-image:linear-gradient(90deg,#000_88%,transparent)]"
          >
            {dates.map((option, index) => {
              const parts = dayParts(option.value);
              const on = option.value === date;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={option.label}
                  onClick={() => {
                    setDate(option.value);
                    setTime("");
                  }}
                  className={cn(
                    chip,
                    "flex w-[4.25rem] shrink-0 snap-start flex-col items-center rounded-[var(--radius-card)] py-2.5",
                    on ? chipOn : chipIdle,
                  )}
                >
                  <span className="text-[11px] font-semibold uppercase tracking-[0.12em] opacity-75">
                    {index === 0 ? "Today" : parts.weekday}
                  </span>
                  <span className="tabular font-[family-name:var(--font-display)] text-[1.45rem] leading-tight">{parts.day}</span>
                  <span className="text-[11px] opacity-75">{parts.month}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2.5">
          <Label htmlFor="guests">Guests</Label>
          <div className="flex items-center gap-4">
            <div className="inline-flex items-center rounded-[var(--radius-control)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-1">
              <button
                type="button"
                aria-label="Fewer guests"
                disabled={guests <= minGuests}
                onClick={() => setGuests((count) => Math.max(minGuests, count - 1))}
                className="press grid size-10 place-items-center rounded-full hover:bg-[var(--tint)] disabled:opacity-35"
              >
                <Minus className="size-4" aria-hidden />
              </button>
              <input
                id="guests"
                type="number"
                inputMode="numeric"
                min={minGuests}
                max={maxGuests}
                value={guests}
                onChange={(event) => setGuests(Math.min(maxGuests, Math.max(minGuests, Number(event.target.value) || minGuests)))}
                className="tabular w-12 bg-transparent text-center font-[family-name:var(--font-display)] text-[1.35rem] outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
              <button
                type="button"
                aria-label="More guests"
                disabled={guests >= maxGuests}
                onClick={() => setGuests((count) => Math.min(maxGuests, count + 1))}
                className="press grid size-10 place-items-center rounded-full hover:bg-[var(--tint)] disabled:opacity-35"
              >
                <Plus className="size-4" aria-hidden />
              </button>
            </div>
            <FieldHint>
              {minGuests}–{maxGuests} guests online. Larger parties: call us.
            </FieldHint>
          </div>
        </div>
      </Step>

      <Step index={2} title="Time">
        {groups.length ? (
          <div className="space-y-5">
            {groups.map(([label, options]) => (
              <div key={label}>
                <p className="mb-2.5 text-[12px] font-medium text-[var(--color-muted-ink)]">{label}</p>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 xl:grid-cols-7">
                  {options.map((option) => {
                    const on = time === option.time;
                    return (
                      <button
                        key={option.time}
                        type="button"
                        data-testid={`slot-${option.time}`}
                        disabled={!option.available}
                        aria-pressed={on}
                        onClick={() => setTime(option.time)}
                        className={cn(
                          chip,
                          "tabular py-2.5 font-medium",
                          on ? chipOn : option.available ? chipIdle : "cursor-not-allowed border-dashed border-[var(--color-hairline)] text-[var(--color-muted-ink)] line-through opacity-55",
                        )}
                      >
                        {option.time}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-[var(--radius-card)] bg-[var(--tint)] px-4 py-3.5 text-sm text-[var(--color-muted-ink)]">
            We are closed on that day, or the kitchen is fully booked. Please pick another date.
          </p>
        )}
        <FieldHint>Slots are {slotMinutes} minutes apart and held for 15 minutes after your booking time.</FieldHint>
        <FieldError>{errors.time}</FieldError>
      </Step>

      <Step index={3} title="You">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="guestName">Name</Label>
            <Input
              id="guestName"
              name="guestName"
              defaultValue={customerDefaults?.fullName ?? ""}
              autoComplete="name"
              required
              aria-invalid={Boolean(errors.guestName) || undefined}
            />
            <FieldError>{errors.guestName}</FieldError>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="guestPhone">Phone</Label>
            <Input
              id="guestPhone"
              name="guestPhone"
              type="tel"
              defaultValue={customerDefaults?.phone ?? ""}
              autoComplete="tel"
              required
              aria-invalid={Boolean(errors.guestPhone) || undefined}
            />
            <FieldError>{errors.guestPhone}</FieldError>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="guestEmail">Email</Label>
            <Input
              id="guestEmail"
              name="guestEmail"
              type="email"
              defaultValue={customerDefaults?.email ?? ""}
              autoComplete="email"
              required
              aria-invalid={Boolean(errors.guestEmail) || undefined}
            />
            <FieldHint>We email you when the request is received and again when it is confirmed.</FieldHint>
            <FieldError>{errors.guestEmail}</FieldError>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="occasion">Occasion (optional)</Label>
            <Select id="occasion" name="occasion" defaultValue="">
              <option value="">Just dinner</option>
              <option value="birthday">Birthday</option>
              <option value="anniversary">Anniversary</option>
              <option value="business">Business meal</option>
              <option value="family">Family gathering</option>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="specialRequests">Special requests (optional)</Label>
            <Textarea id="specialRequests" name="specialRequests" rows={3} maxLength={400} placeholder="High chair, terrace table, allergies…" />
          </div>
        </div>
      </Step>

      {/* the booking so far + the action: inline on wide screens, a bar pinned to the bottom on phones */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--rule)] bg-[color-mix(in_srgb,var(--color-canvas)_92%,transparent)] px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md md:static md:z-auto md:flex md:items-center md:justify-between md:gap-6 md:rounded-[var(--radius-panel)] md:border md:border-[var(--color-hairline)] md:bg-[var(--color-surface)] md:p-5 md:pl-7 md:backdrop-blur-none">
        <div className="hidden min-w-0 md:block">
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-[var(--color-muted-ink)]">Your table</p>
          <p className="mt-1 truncate font-[family-name:var(--font-display)] text-[1.25rem]">
            {summary}
            {location && locations.length > 1 ? <span className="text-[var(--color-muted-ink)]"> · {location.name}</span> : null}
          </p>
        </div>
        <div className="flex items-center gap-3 md:shrink-0">
          <p className="min-w-0 flex-1 truncate text-[13px] font-medium md:hidden">{summary}</p>
          <Button type="submit" size="lg" data-testid="request-table" disabled={pending || !timeOptions.length}>
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <CalendarCheck aria-hidden />}
            {pending ? "Submitting…" : "Request table"}
          </Button>
        </div>
      </div>
    </form>
  );
}
