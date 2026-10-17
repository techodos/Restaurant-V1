import type { Reservation } from "@/shared/contract/models";
import { formatDateKey } from "@/shared/hours";
import type { NotificationRestaurant } from "../types";
import { details, emailPalette, escapeHtml, paragraph, renderEmailLayout, textFooter, type EmailBrand } from "./layout";
import { firstNameOf, type RenderedEmail } from "./order-confirmation";

/**
 * Reservation emails (both go through the same outbox as order emails):
 *  - "requested": sent right after the customer submits the request; it is NOT a confirmation
 *  - "confirmed": sent once, when the restaurant confirms the reservation
 */

export interface ReservationEmailInput {
  restaurant: NotificationRestaurant & Pick<EmailBrand, "siteUrl">;
  reservation: Reservation;
}

/** "YYYY-MM-DD" → "Friday, 25 September 2026". The date has no time zone, so it is formatted as UTC. */
export function formatReservationDate(date: string, locale: string): string {
  return formatDateKey(date, locale);
}

/** "19:30" is a wall-clock time at the restaurant; shown as written. */
export function formatReservationTime(time: string): string {
  return time.slice(0, 5);
}

function detailRows(input: ReservationEmailInput, statusLabel: string): [string, string][] {
  const { restaurant, reservation } = input;
  const rows: [string, string][] = [
    ["Date", formatReservationDate(reservation.reservationDate, restaurant.locale)],
    ["Time", formatReservationTime(reservation.reservationTime)],
    ["Guests", String(reservation.guests)],
    ["Where", reservation.locationName ? `${restaurant.name} · ${reservation.locationName}` : restaurant.name],
    ["Name", reservation.guestName],
    ["Reference", reservation.confirmationCode],
    ["Status", statusLabel],
  ];
  if (reservation.specialRequests) rows.push(["Requests", reservation.specialRequests]);
  return rows;
}

const detailsText = (rows: [string, string][]) => rows.map(([label, value]) => `${label}: ${value}`).join("\n");

export function renderReservationRequestedEmail(input: ReservationEmailInput): RenderedEmail {
  const { restaurant, reservation } = input;
  const palette = emailPalette(restaurant.primaryColor);
  const rows = detailRows(input, "Awaiting confirmation");
  const name = firstNameOf(reservation.guestName);

  const bodyHtml = [
    paragraph(
      `Hi ${escapeHtml(name)}, thank you for your reservation request at ${escapeHtml(restaurant.name)}. We have received it and it is <strong style="color:#1d1a16;">awaiting confirmation</strong>.`,
    ),
    details(rows, palette),
    paragraph("Your table is <strong style=\"color:#1d1a16;\">not confirmed yet</strong>. We'll email you again as soon as it is.", { size: 14 }),
  ].join("");

  const html = renderEmailLayout({
    brand: restaurant,
    preheader: `We received your request for ${formatReservationDate(reservation.reservationDate, restaurant.locale)} at ${formatReservationTime(reservation.reservationTime)} — awaiting confirmation.`,
    eyebrow: "Reservation request",
    heading: "We've received your request",
    bodyHtml,
    footerNote: "Need to change something? Reply to this email or call us and quote your reference.",
  });

  const text = [
    `Hi ${name}, thank you for your reservation request at ${restaurant.name}.`,
    "We have received it and it is awaiting confirmation.",
    "",
    detailsText(rows),
    "",
    "Your table is not confirmed yet. We'll email you again as soon as it is.",
    "",
    textFooter(restaurant),
  ].join("\n");

  return { subject: `Reservation request received — ${restaurant.name}`, html, text };
}

export function renderReservationConfirmedEmail(input: ReservationEmailInput): RenderedEmail {
  const { restaurant, reservation } = input;
  const palette = emailPalette(restaurant.primaryColor);
  const rows = detailRows(input, "Confirmed");
  const name = firstNameOf(reservation.guestName);

  const bodyHtml = [
    paragraph(
      `Hi ${escapeHtml(name)}, <strong style="color:#1d1a16;">your table at ${escapeHtml(restaurant.name)} is confirmed</strong>. We look forward to welcoming you.`,
    ),
    details(rows, palette),
    paragraph("Please arrive within 15 minutes of your booking time and mention your reference at the door.", { size: 14 }),
  ].join("");

  const html = renderEmailLayout({
    brand: restaurant,
    preheader: `Confirmed: ${formatReservationDate(reservation.reservationDate, restaurant.locale)} at ${formatReservationTime(reservation.reservationTime)}, ${reservation.guests} ${reservation.guests === 1 ? "guest" : "guests"}.`,
    eyebrow: "Reservation confirmed",
    heading: "Your table is confirmed",
    bodyHtml,
    footerNote: "Plans changed? Please call or reply to this email so we can offer the table to another guest.",
  });

  const text = [
    `Hi ${name}, your reservation at ${restaurant.name} is confirmed.`,
    "",
    detailsText(rows),
    "",
    "Please arrive within 15 minutes of your booking time and mention your reference at the door.",
    "",
    textFooter(restaurant),
  ].join("\n");

  return { subject: `Reservation confirmed — ${restaurant.name}`, html, text };
}
