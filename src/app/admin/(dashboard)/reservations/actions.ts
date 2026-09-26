"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { ApiResult } from "@/shared/contract/api";
import type { Reservation } from "@/shared/contract/models";
import { action } from "@/server/errors";
import { changeReservationStatus } from "@/server/services/reservations";
import { dispatchDueNotifications } from "@/server/services/notifications";
import { updateReservationStatusSchema } from "@/server/validation/reservation";
import { requirePermission } from "@/web/session";

/**
 * Changes a reservation's status, then drains the notification outbox after the response: the DB trigger
 * (0017) queues "Reservation confirmed" in the same transaction, and without this it would wait for the
 * scheduler. Dispatch never throws and never affects the status change.
 */
export async function updateReservationStatusAction(payload: unknown): Promise<ApiResult<Reservation>> {
  return action(async () => {
    const actor = await requirePermission("reservations.manage");
    const input = updateReservationStatusSchema.parse(payload);
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };

    const reservation = await changeReservationStatus(input.reservationId, input.status, ctx, input.notes || null);

    revalidatePath("/admin/reservations");
    revalidatePath("/admin");

    after(() => dispatchDueNotifications({ restaurantId: actor.restaurantId }, { restaurantId: actor.restaurantId }));
    return reservation;
  });
}
