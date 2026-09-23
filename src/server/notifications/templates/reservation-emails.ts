import type { Reservation } from "@/shared/contract/models";
import type { NotificationRestaurant } from "../types";
import { escapeHtml, renderEmailLayout } from "./layout";
import type { RenderedEmail } from "./order-confirmation";

/**
 * Reservation emails (both go through the same outbox as order emails):
 *  - "requested": sent right after the customer submits the request; it is NOT a confirmation
 *  - "confirmed": sent once, when the restaurant confirms the reservation
 */

export interface ReservationEmailInput {
  restaurant: NotificationRestaurant;
  reservation: Reservation;
}

/** "YYYY-MM-DD" → "Friday, 25 September 2026". The date has no time zone, so it is formatted as UTC. */
export function formatReservationDate(date: string, locale: string): string {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return date;
  try {
    return parsed.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  } catch {
    return date;
  }
}

/** "19:30" is a wall-clock time at the restaurant; shown as written. */
export function formatReservationTime(time: string): string {
  return time.slice(0, 5);
}

function detailRows(input: ReservationEmailInput, statusLabel: string): [string, string][] {
  const { restaurant, reservation } = input;
  const rows: [string, string][] = [
    ["Restaurant", restaurant.name],
    ...(reservation.locationName ? ([["Location", reservation.locationName]] as [string, string][]) : []),
    ["Date", formatReservationDate(reservation.reservationDate, restaurant.locale)],
    ["Time", formatReservationTime(reservation.reservationTime)],
    ["Guests", String(reservation.guests)],
    ["Name", reservation.guestName],
    ["Reference", reservation.confirmationCode],
    ["Status", statusLabel],
  ];
  if (reservation.specialRequests) rows.push(["Special requests", reservation.specialRequests]);
  return rows;
}

function detailsHtml(rows: [string, string][]): string {
  const body = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 12px 4px 0;font-size:14px;color:#6b6259;white-space:nowrap;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:4px 0;font-size:14px;font-weight:600;">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  return `<div style="background:#faf8f5;border-radius:8px;padding:12px 16px;margin:0 0 16px;"><table role="presentation" cellspacing="0" cellpadding="0">${body}</table></div>`;
}

function detailsText(rows: [string, string][]): string {
  return rows.map(([label, value]) => `${label}: ${value}`).join("\n");
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

export function renderReservationRequestedEmail(input: ReservationEmailInput): RenderedEmail {
  const { restaurant, reservation } = input;
  const rows = detailRows(input, "Pending confirmation");
  const name = firstName(reservation.guestName);

  const bodyHtml = `
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hi ${escapeHtml(name)}, thank you for your reservation request at ${escapeHtml(restaurant.name)}. We have received it and it is <strong>awaiting confirmation</strong> from the restaurant.</p>
${detailsHtml(rows)}
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Your table is <strong>not confirmed yet</strong>. You will receive another email as soon as the restaurant confirms your reservation.</p>`;

  const html = renderEmailLayout({
    brand: restaurant,
    preheader: `Your reservation request at ${restaurant.name} was received and is awaiting confirmation`,
    heading: "Reservation request received",
    bodyHtml,
    footerNote: "Need to change something? Reply to this email or call the restaurant and quote your reference.",
  });

  const text = [
    `Hi ${name}, thank you for your reservation request at ${restaurant.name}.`,
    "We have received it and it is awaiting confirmation from the restaurant.",
    "",
    detailsText(rows),
    "",
    "Your table is not confirmed yet. You will receive another email as soon as the restaurant confirms your reservation.",
  ].join("\n");

  return { subject: `Reservation request received — ${restaurant.name}`, html, text };
}

export function renderReservationConfirmedEmail(input: ReservationEmailInput): RenderedEmail {
  const { restaurant, reservation } = input;
  const rows = detailRows(input, "Confirmed");
  const name = firstName(reservation.guestName);

  const bodyHtml = `
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Hi ${escapeHtml(name)}, good news: <strong>your reservation at ${escapeHtml(restaurant.name)} is confirmed</strong>. We look forward to welcoming you.</p>
${detailsHtml(rows)}
<p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Please arrive within 15 minutes of your booking time and mention your reference at the door.</p>`;

  const html = renderEmailLayout({
    brand: restaurant,
    preheader: `Your reservation at ${restaurant.name} is confirmed`,
    heading: "Your reservation is confirmed",
    bodyHtml,
    footerNote: "Plans changed? Please call or reply to this email so we can free the table for another guest.",
  });

  const text = [
    `Hi ${name}, your reservation at ${restaurant.name} is confirmed.`,
    "",
    detailsText(rows),
    "",
    "Please arrive within 15 minutes of your booking time and mention your reference at the door.",
  ].join("\n");

  return { subject: `Reservation confirmed — ${restaurant.name}`, html, text };
}
