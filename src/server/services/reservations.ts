import type { Reservation, Restaurant } from "@/shared/contract/models";
import type { ReservationStatus } from "@/shared/contract/enums";
import type { Paginated } from "@/shared/contract/api";
import { errors } from "@/server/errors";
import { forRestaurant, type RequestContext } from "@/server/context";
import {
  bookReservation,
  listBookedSlotsInRange,
  listReservations,
  updateReservationStatus,
  type ReservationListFilters,
} from "@/server/repositories/reservations";
import type { BookTableInput } from "@/server/validation/reservation";

/** Guest table booking: availability, capacity and hours are all server-side. */

/**
 * `restaurant` only routes the request (it may come from the storefront snapshot): everything the booking
 * is decided from — reservations switched on, the reservation settings, time zone, the location's hours,
 * the customer's account and the slot's bookings — is read fresh inside the booking transaction
 * (`bookReservation`, one read + one insert).
 */
export async function bookTable(restaurant: Restaurant, input: BookTableInput, visitor: RequestContext): Promise<Reservation> {
  // cheap pre-checks, in the order the customer should hear about them (the transaction re-checks)
  if (!restaurant.features.reservations) {
    throw errors.custom("RESERVATION_CLOSED", "This restaurant is not taking reservations online.");
  }
  // Reservations are for signed-in customers only, same as checkout (placeOrderAction's own comment:
  // hiding the form for guests is only UX — this is the real, server-side gate).
  if (!visitor.customerId) {
    throw errors.custom("SIGN_IN_REQUIRED", "Please sign in to reserve a table.");
  }

  // The signed-in visitor's own account (matched by id, keyed by their account email) is the customer of
  // record — never re-derived from the phone/email typed into this form (same reasoning as checkout's
  // placeOrder: `customers` has independent unique keys on phone AND on email). Its saved mobile/email
  // win over the form's. The request and confirmation emails are queued by the database trigger in the
  // same transaction as the insert (migration 0017); the caller dispatches them after responding.
  return bookReservation(
    {
      restaurantId: restaurant.id,
      locationId: input.locationId,
      accountCustomerId: visitor.customerId,
      guestName: input.guestName,
      guestPhone: input.guestPhone,
      guestEmail: input.guestEmail || null,
      date: input.date,
      time: input.time,
      guests: input.guests,
      occasion: input.occasion || null,
      specialRequests: input.specialRequests || null,
    },
    { restaurantId: restaurant.id, customerId: visitor.customerId },
  );
}

/**
 * Bookings per slot across a date window: `counts["<locationId>:<date>"]["19:30"]`
 * is how many active reservations start at that time. One database round of
 * queries however many days and locations there are.
 */
export type BookedSlotCounts = Record<string, Record<string, number>>;

export async function getBookedSlotCounts(
  restaurantId: string,
  locationIds: readonly string[],
  fromDate: string,
  toDate: string,
): Promise<BookedSlotCounts> {
  const booked = await listBookedSlotsInRange(locationIds, fromDate, toDate, forRestaurant(restaurantId));
  const counts: BookedSlotCounts = {};
  for (const { locationId, date, time } of booked) {
    const day = (counts[`${locationId}:${date}`] ??= {});
    day[time] = (day[time] ?? 0) + 1;
  }
  return counts;
}

/** Staff-facing reservation list (admin). */
export function listReservationsForStaff(
  restaurantId: string,
  filters: ReservationListFilters,
  ctx: RequestContext,
): Promise<Paginated<Reservation>> {
  return listReservations(restaurantId, filters, ctx);
}

/** Staff-facing status change (admin). Any status can move to any other — no rank rule. */
export function changeReservationStatus(
  reservationId: string,
  status: ReservationStatus,
  ctx: RequestContext,
  notes?: string | null,
): Promise<Reservation> {
  return updateReservationStatus(reservationId, status, ctx, notes);
}
