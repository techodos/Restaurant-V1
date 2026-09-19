"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ApiResult } from "@/lib/contract/api";
import { createReservation } from "@/lib/db/reservations";
import { getRestaurantBySlug, listLocations } from "@/lib/db/restaurants";
import { EMPTY_CONTEXT } from "@/lib/db/pool";
import { resolveCustomerFromSession } from "@/lib/auth";
import { action, errors } from "@/lib/errors";

/** Guest table booking: availability, capacity and hours are all server-side. */

const reservationSchema = z.object({
  locationId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Please choose a date."),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Please choose a time."),
  guests: z.coerce.number().int().min(1).max(60),
  guestName: z.string().trim().min(2, "Please enter your name.").max(120),
  guestPhone: z
    .string()
    .trim()
    .min(7, "Please enter a contact number.")
    .max(24)
    .regex(/^[+0-9()\s-]+$/, "Please enter a valid phone number."),
  guestEmail: z.string().trim().email("That email looks incomplete.").max(160).optional().or(z.literal("")),
  occasion: z.string().trim().max(60).optional().or(z.literal("")),
  specialRequests: z.string().trim().max(400).optional().or(z.literal("")),
});

export interface BookingResult {
  confirmationCode: string;
  status: string;
  date: string;
  time: string;
}

export async function bookTableAction(slug: string, payload: unknown): Promise<ApiResult<BookingResult>> {
  return action(async () => {
    const input = reservationSchema.parse(payload);
    const restaurant = await getRestaurantBySlug(slug);
    if (!restaurant) throw errors.notFound("Restaurant");
    if (!restaurant.features.reservations) {
      throw errors.custom("RESERVATION_CLOSED", "This restaurant is not taking reservations online.");
    }

    const locations = await listLocations(restaurant.id, EMPTY_CONTEXT);
    const location = locations.find((candidate) => candidate.id === input.locationId && candidate.isActive);
    if (!location) throw errors.validation("Please choose one of our locations.");

    const customer = await resolveCustomerFromSession(slug);

    const reservation = await createReservation(
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
        customerId: customer?.customerId ?? null,
        userId: customer?.userId ?? null,
        autoConfirm: restaurant.settings.reservations.autoConfirm,
        settings: restaurant.settings.reservations,
        timezone: restaurant.timezone,
        hours: location.hours,
      },
      { customerId: customer?.customerId ?? null },
    );

    revalidatePath(`/r/${slug}/reservation`);
    return {
      confirmationCode: reservation.confirmationCode,
      status: reservation.status,
      date: reservation.reservationDate,
      time: reservation.reservationTime,
    };
  });
}
