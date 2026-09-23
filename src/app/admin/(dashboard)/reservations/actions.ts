"use server";

import { revalidatePath } from "next/cache";
import type { ApiResult } from "@/shared/contract/api";
import type { Reservation } from "@/shared/contract/models";
import { action } from "@/server/errors";
import { changeReservationStatus } from "@/server/services/reservations";
import { updateReservationStatusSchema } from "@/server/validation/reservation";
import { requirePermission } from "@/web/session";

export async function updateReservationStatusAction(payload: unknown): Promise<ApiResult<Reservation>> {
  return action(async () => {
    const actor = await requirePermission("reservations.manage");
    const input = updateReservationStatusSchema.parse(payload);
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };

    const reservation = await changeReservationStatus(input.reservationId, input.status, ctx, input.notes || null);

    revalidatePath("/admin/reservations");
    return reservation;
  });
}
