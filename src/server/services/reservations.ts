import type { Reservation, Restaurant } from "@/shared/contract/models";
import type { ReservationStatus } from "@/shared/contract/enums";
import type { Paginated } from "@/shared/contract/api";
import { errors } from "@/server/errors";
import { forRestaurant, type RequestContext } from "@/server/context";
import {
  createReservation,
  listBookedSlotsInRange,
  listReservations,
  updateReservationStatus,
  type ReservationListFilters,
} from "@/server/repositories/reservations";
import type { BookTableInput } from "@/server/validation/reservation";
import { getLocations } from "./restaurants";

/** Guest table booking: availability, capacity and hours are all server-side. */

export async function bookTable(restaurant: Restaurant, input: BookTableInput, visitor: RequestContext): Promise<Reservation> {
  if (!restaurant.features.reservations) {
    throw errors.custom("RESERVATION_CLOSED", "This restaurant is not taking reservations online.");
  }

  const locations = await getLocations(restaurant.id, { activeOnly: true });
  const location = locations.find((candidate) => candidate.id === input.locationId);
  if (!location) throw errors.validation("Please choose one of our locations.");

  return createReservation(
    {
      restaurantId: restaurant.id,
      locationId: location.id,
      guestName: input.guestName,
      guestPhone: input.guestPhone,
      guestEmail: input.guestEmail || null,
      date: input.date,
      time: input.time,
      guests: input.guests,
      occasion: input.occasion || null,
      specialRequests: input.specialRequests || null,
      customerId: visitor.customerId ?? null,
      userId: visitor.userId ?? null,
      autoConfirm: restaurant.settings.reservations.autoConfirm,
      settings: restaurant.settings.reservations,
      timezone: restaurant.timezone,
      hours: location.hours,
    },
    { restaurantId: restaurant.id, customerId: visitor.customerId ?? null },
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
