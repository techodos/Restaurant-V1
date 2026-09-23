"use client";

import { useMemo, useState, useTransition } from "react";
import { CalendarCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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

/**
 * Reservation form. Slot availability shown here is derived from the database
 * (booked vs. configured table capacity) and re-checked atomically by
 * createReservation, so two guests cannot take the same last table.
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

  const capacity = slotsByDate[`${locationId}:${date}`] ?? {};
  const timeOptions = useMemo(
    () =>
      Object.entries(capacity)
        .map(([slot, info]) => ({ time: slot, available: info.booked < info.capacity }))
        .sort((left, right) => left.time.localeCompare(right.time)),
    [capacity],
  );

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

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {locations.length > 1 ? (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="locationId">Location</Label>
            <Select
              id="locationId"
              value={locationId}
              onChange={(event) => {
                setLocationId(event.target.value);
                setTime("");
              }}
            >
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                  {location.area ? ` · ${location.area}` : ""}
                </option>
              ))}
            </Select>
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="date">Date</Label>
          <Select
            id="date"
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              setTime("");
            }}
          >
            {dates.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="guests">Guests</Label>
          <Input
            id="guests"
            type="number"
            min={minGuests}
            max={maxGuests}
            value={guests}
            onChange={(event) => setGuests(Number(event.target.value))}
          />
          <FieldHint>
            {minGuests}–{maxGuests} guests online. Larger parties: call us.
          </FieldHint>
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label>Time</Label>
          {timeOptions.length ? (
            <div className="flex flex-wrap gap-2">
              {timeOptions.map((option) => (
                <button
                  key={option.time}
                  type="button"
                  data-testid={`slot-${option.time}`}
                  disabled={!option.available}
                  aria-pressed={time === option.time}
                  onClick={() => setTime(option.time)}
                  className={
                    time === option.time
                      ? "rounded-full border border-[var(--color-brand)] bg-[var(--color-brand)] px-3.5 py-1.5 text-sm text-[var(--color-brand-foreground)]"
                      : option.available
                        ? "rounded-full border border-[var(--color-hairline)] px-3.5 py-1.5 text-sm hover:border-[var(--color-brand)]"
                        : "cursor-not-allowed rounded-full border border-[var(--color-hairline)] px-3.5 py-1.5 text-sm text-[var(--color-muted-ink)] line-through opacity-60"
                  }
                >
                  {option.time}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-muted-ink)]">
              We are closed on that day, or the kitchen is fully booked. Please pick another date.
            </p>
          )}
          <FieldHint>Slots are {slotMinutes} minutes apart and held for 15 minutes after your booking time.</FieldHint>
          <FieldError>{errors.time}</FieldError>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="guestName">Name</Label>
          <Input id="guestName" name="guestName" defaultValue={customerDefaults?.fullName ?? ""} autoComplete="name" required />
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
          />
          <FieldError>{errors.guestPhone}</FieldError>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="guestEmail">Email</Label>
          <Input id="guestEmail" name="guestEmail" type="email" defaultValue={customerDefaults?.email ?? ""} autoComplete="email" required />
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

      <Button type="submit" size="lg" data-testid="request-table" disabled={pending || !timeOptions.length}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <CalendarCheck aria-hidden />}
        {pending ? "Submitting…" : "Request table"}
      </Button>
    </form>
  );
}
