"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { ApiResult } from "@/shared/contract/api";
import { action } from "@/server/errors";
import { dispatchDueNotifications } from "@/server/services/notifications";
import { bookTable } from "@/server/services/reservations";
import { requireRestaurant } from "@/server/services/restaurants";
import { bookTableSchema } from "@/server/validation/reservation";
import { getVisitorContext } from "@/web/session";

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

/** Guest table booking: parse input, delegate to the reservation service. */
export async function bookTableAction(slug: string, payload: unknown): Promise<ApiResult<BookingResult>> {
  return action(async () => {
    const input = bookTableSchema.parse(payload);
    const restaurant = await requireRestaurant(slug);
    const visitor = await getVisitorContext(restaurant.id);
    const reservation = await bookTable(restaurant, input, visitor);

    revalidatePath(`/r/${slug}/reservation`);

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
