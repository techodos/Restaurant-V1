"use client";

import { useEffect, useRef } from "react";
import { formatDateKey } from "@/shared/hours";
import Link from "next/link";
import { CalendarCheck, CheckCircle2, Mail } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BookingResult } from "@/app/r/[restaurantSlug]/reservation/actions";

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

  const details: [string, string][] = [
    ["Restaurant", booking.restaurantName],
    ...(booking.locationName ? ([["Location", booking.locationName]] as [string, string][]) : []),
    ["Date", formatDateKey(booking.date)],
    ["Time", booking.time],
    ["Guests", String(booking.guests)],
    ["Name", booking.guestName],
  ];

  return (
    <div
      role="status"
      data-testid="reservation-success"
      className="mx-auto w-full max-w-xl surface-flat p-6 text-center sm:p-10"
    >
      <span className="mx-auto grid size-16 place-items-center rounded-[var(--radius-card)] ring-8 ring-[color-mix(in_srgb,var(--color-brand)_5%,transparent)] bg-[color-mix(in_srgb,var(--color-success)_12%,transparent)] text-[color-mix(in_srgb,var(--color-success)_80%,var(--color-ink))]">
        {confirmed ? <CalendarCheck className="size-7" aria-hidden /> : <CheckCircle2 className="size-7" aria-hidden />}
      </span>
      <h2 ref={heading} tabIndex={-1} className="mt-5 text-2xl font-semibold outline-none sm:text-3xl">
        {confirmed ? "Your table is confirmed" : "Request submitted successfully"}
      </h2>
      <p className="mt-3 text-[var(--color-muted-ink)]">
        {confirmed
          ? "We have reserved your table. Please arrive within 15 minutes of your booking time."
          : "Your request has been submitted successfully. You will receive a confirmation message as soon as the restaurant confirms your reservation."}
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Badge variant="brand" className="text-base" aria-label={`Reference ${booking.confirmationCode}`}>
          {booking.confirmationCode}
        </Badge>
        <Badge variant={confirmed ? "success" : "warning"}>{confirmed ? "Confirmed" : "Pending confirmation"}</Badge>
      </div>

      <dl className="mt-6 divide-y divide-[var(--color-hairline)] rounded-[var(--radius-brand)] border border-[var(--color-hairline)] text-left text-sm">
        {details.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 px-4 py-2.5">
            <dt className="text-[var(--color-muted-ink)]">{label}</dt>
            <dd className="text-right font-medium">{value}</dd>
          </div>
        ))}
      </dl>

      {booking.guestEmail ? (
        <p className="mt-5 flex items-start justify-center gap-2 text-sm text-[var(--color-muted-ink)]">
          <Mail className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {confirmed ? "A confirmation" : "An email with these details"} is on its way to{" "}
            <span className="font-medium text-[var(--color-ink)]">{booking.guestEmail}</span>.
          </span>
        </p>
      ) : null}

      <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
        <Button asChild>
          <Link href={`/r/${restaurantSlug}`}>Back to home</Link>
        </Button>
        <Button variant="outline" onClick={onBookAnother}>
          Book another table
        </Button>
      </div>
    </div>
  );
}
