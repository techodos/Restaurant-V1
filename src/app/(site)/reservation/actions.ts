"use server";

import { after } from "next/server";
import type { ApiResult } from "@/shared/contract/api";
import { action } from "@/server/errors";
import { dispatchDueNotifications } from "@/server/services/notifications";
import { bookTable } from "@/server/services/reservations";
import { bookTableSchema } from "@/server/validation/reservation";
import { getVisitorContext } from "@/web/session";
import { requireStorefrontRestaurant } from "@/web/storefront";

export interface BookingResult {
  confirmationCode: string;
  status: string;
  date: string;
  time: string;
  guests: number;
  guestName: string;
  guestEmail: string | null;
  restaurantName: string;
  locationName: string | null;
}

/**
 * Table booking: parse input, delegate to the reservation service.
 *
 * The restaurant comes from the storefront snapshot only to route the request; the booking transaction
 * re-reads everything it decides from (`bookReservation`). No `revalidatePath`: the form swaps to its
 * confirmation from this result and never needed the page re-rendered into the response (that cost the
 * availability query and the profile read, ~2 s, on every booking); "Book another" refreshes the
 * availability instead (reservation-form.tsx). The page is dynamic, so any visit reads it fresh.
 */
export async function bookTableAction(slug: string, payload: unknown): Promise<ApiResult<BookingResult>> {
  return action(async () => {
    const input = bookTableSchema.parse(payload);
    const restaurant = await requireStorefrontRestaurant(slug);
    const visitor = await getVisitorContext(restaurant.id);
    const reservation = await bookTable(restaurant, input, visitor);

    // The reservation is committed and its email event queued by the database. Delivering it happens
    // after the response and never affects the result: a mail outage cannot fail the booking.
    after(() => dispatchDueNotifications({ restaurantId: restaurant.id }, { restaurantId: restaurant.id }));

    return {
      confirmationCode: reservation.confirmationCode,
      status: reservation.status,
      date: reservation.reservationDate,
      time: reservation.reservationTime,
      guests: reservation.guests,
      guestName: reservation.guestName,
      guestEmail: reservation.guestEmail,
      restaurantName: restaurant.name,
      locationName: reservation.locationName ?? null,
    };
  });
}
