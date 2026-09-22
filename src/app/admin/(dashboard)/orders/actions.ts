"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { ApiResult } from "@/shared/contract/api";
import type { Order } from "@/shared/contract/models";
import { action } from "@/server/errors";
import { changeOrderStatus } from "@/server/services/orders";
import { dispatchDueNotifications } from "@/server/services/notifications";
import { updateOrderStatusSchema } from "@/server/validation/orders";
import { requirePermission } from "@/web/session";

/** Advances an order's status, then drains the notification outbox after the response. */
export async function updateOrderStatusAction(payload: unknown): Promise<ApiResult<Order>> {
  return action(async () => {
    const actor = await requirePermission("orders.update_status");
    const input = updateOrderStatusSchema.parse(payload);
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };

    const order = await changeOrderStatus(input.orderId, input.status, ctx, {
      note: input.note || null,
      cancelReason: input.cancelReason || null,
    });

    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${order.orderNumber}`);
    revalidatePath("/admin");

    after(() => dispatchDueNotifications({ restaurantId: actor.restaurantId }, { restaurantId: actor.restaurantId }));
    return order;
  });
}
