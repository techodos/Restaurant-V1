"use client";

import { useEffect, useRef } from "react";
import { formatDateKey } from "@/shared/hours";
import Link from "next/link";
import { CalendarCheck, Clock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { BookingResult } from "@/app/(site)/reservation/actions";

interface ReservationSuccessProps {
  restaurantSlug: string;
  booking: BookingResult;
  onBookAnother: () => void;
}

/**
 * Shown only after the reservation was saved. A request waits for the restaurant
 * ("pending"); a restaurant with auto-confirm gets a confirmed reservation straight away.
 */
export function ReservationSuccess({ restaurantSlug, booking, onBookAnother }: ReservationSuccessProps) {
  const confirmed = booking.status === "confirmed";
  const heading = useRef<HTMLHeadingElement>(null);

  // the form was long: bring the result into view and announce it to screen readers
  useEffect(() => {
    heading.current?.focus();
    heading.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, []);

  const facts: [string, string][] = [
    ["Date", formatDateKey(booking.date)],
    ["Time", booking.time],
    ["Guests", String(booking.guests)],
    [booking.locationName ? "Location" : "Restaurant", booking.locationName ?? booking.restaurantName],
  ];

  return (
    <div role="status" data-testid="reservation-success" className="mx-auto w-full max-w-xl animate-rise">
      <div className="overflow-hidden rounded-[var(--radius-panel)] border border-[var(--color-hairline)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
        <div className="px-6 pb-7 pt-7 sm:px-9 sm:pt-9">
          <span
            className={
              confirmed
                ? "inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--color-success)_12%,transparent)] px-3 py-1 text-[12px] font-semibold text-[color-mix(in_srgb,var(--color-success)_85%,var(--color-ink))]"
                : "inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--color-warning)_14%,transparent)] px-3 py-1 text-[12px] font-semibold text-[color-mix(in_srgb,var(--color-warning)_80%,var(--color-ink))]"
            }
          >
            {confirmed ? <CalendarCheck className="size-3.5" aria-hidden /> : <Clock className="size-3.5" aria-hidden />}
            {confirmed ? "Confirmed" : "Pending confirmation"}
          </span>
          <h2 ref={heading} tabIndex={-1} className="display-2 mt-4 text-balance outline-none">
            {confirmed ? "Your table is confirmed" : "Request received"}
          </h2>
          <p className="mt-3 text-[15px] leading-relaxed text-[var(--color-muted-ink)]">
            {confirmed
              ? "We have reserved your table. Please arrive within 15 minutes of your booking time."
              : "The restaurant will confirm your table shortly. We will let you know as soon as they do."}
          </p>

          <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-hairline)] bg-[var(--color-hairline)]">
            {facts.map(([label, value]) => (
              <div key={label} className="min-w-0 bg-[var(--color-surface)] px-4 py-3.5">
                <dt className="label-caps text-[var(--color-muted-ink)]">{label}</dt>
                <dd className="mt-1 text-[16px] font-semibold leading-snug tabular-nums [overflow-wrap:anywhere]">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* tear line: the reference is the stub the guest keeps */}
        <div aria-hidden className="relative h-0 border-t border-dashed border-[var(--rule-strong)]">
          <span className="absolute -left-3 -top-3 size-6 rounded-full border border-[var(--color-hairline)] bg-[var(--color-canvas)]" />
          <span className="absolute -right-3 -top-3 size-6 rounded-full border border-[var(--color-hairline)] bg-[var(--color-canvas)]" />
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4 bg-[var(--tint)] px-6 py-5 sm:px-9">
          <div className="min-w-0">
            <p className="label-caps text-[var(--color-muted-ink)]">Reference</p>
            <p className="mt-1 font-mono text-[22px] font-semibold tracking-[0.12em]" aria-label={`Reference ${booking.confirmationCode}`}>
              {booking.confirmationCode}
            </p>
          </div>
          <p className="text-right text-[13px] text-[var(--color-muted-ink)]">
            Booked for <span className="font-medium text-[var(--color-ink)]">{booking.guestName}</span>
          </p>
        </div>
      </div>

      {booking.guestEmail ? (
        <p className="mt-5 flex items-start justify-center gap-2 px-2 text-center text-sm text-[var(--color-muted-ink)]">
          <Mail className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {confirmed ? "A confirmation" : "An email with these details"} is on its way to{" "}
            <span className="break-all font-medium text-[var(--color-ink)]">{booking.guestEmail}</span>.
          </span>
        </p>
      ) : null}

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
        <Button asChild size="lg">
          <Link href={"/"}>Back to home</Link>
        </Button>
        <Button variant="outline" size="lg" onClick={onBookAnother}>
          Book another table
        </Button>
      </div>
    </div>
  );
}
