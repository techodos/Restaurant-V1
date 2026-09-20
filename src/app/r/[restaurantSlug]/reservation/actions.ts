"use server";

import { revalidatePath } from "next/cache";
import type { ApiResult } from "@/shared/contract/api";
import { action } from "@/server/errors";
import { bookTable } from "@/server/services/reservations";
import { requireRestaurant } from "@/server/services/restaurants";
import { bookTableSchema } from "@/server/validation/reservation";
import { getVisitorContext } from "@/web/session";

export interface BookingResult {
  confirmationCode: string;
  status: string;
  date: string;
  time: string;
}

/** Guest table booking: parse input, delegate to the reservation service. */
export async function bookTableAction(slug: string, payload: unknown): Promise<ApiResult<BookingResult>> {
  return action(async () => {
    const input = bookTableSchema.parse(payload);
    const restaurant = await requireRestaurant(slug);
    const visitor = await getVisitorContext(restaurant.id);
    const reservation = await bookTable(restaurant, input, visitor);

    revalidatePath(`/r/${slug}/reservation`);
    return {
      confirmationCode: reservation.confirmationCode,
      status: reservation.status,
      date: reservation.reservationDate,
      time: reservation.reservationTime,
    };
  });
}
