import type { Reservation, Restaurant } from "@/shared/contract/models";
import { errors } from "@/server/errors";
import { forRestaurant, type RequestContext } from "@/server/context";
import { createReservation, listBookedSlots } from "@/server/repositories/reservations";
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

export function getBookedSlots(restaurantId: string, locationId: string, date: string) {
  return listBookedSlots(locationId, date, forRestaurant(restaurantId));
}
