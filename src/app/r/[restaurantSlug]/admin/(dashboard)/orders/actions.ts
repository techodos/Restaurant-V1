"use server";

import { revalidatePath } from "next/cache";
import { adminPath } from "@/shared/utils";
import { after } from "next/server";
import type { ApiResult } from "@/shared/contract/api";
import { action } from "@/server/errors";
import { changeOrderStatus, type OrderStatusChange } from "@/server/services/orders";
import { dispatchDueNotifications } from "@/server/services/notifications";
import { updateOrderStatusSchema } from "@/server/validation/orders";
import { requirePermission } from "@/web/session";

/**
 * Advances an order's status, then drains the notification outbox after the response.
 *
 * `revalidatePath` makes Next answer this action with the CURRENT page (order detail, kitchen or
 * dashboard) freshly rendered, so the status control must not `router.refresh()` afterwards — that was
 * a second full render of the same page (~5 s on the hosted pooler) after every click.
 */
export async function updateOrderStatusAction(payload: unknown): Promise<ApiResult<OrderStatusChange>> {
  return action(async () => {
    const actor = await requirePermission("orders.update_status");
    const input = updateOrderStatusSchema.parse(payload);
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };

    const order = await changeOrderStatus(input.orderId, input.status, ctx, {
      note: input.note || null,
      cancelReason: input.cancelReason || null,
    });

    revalidatePath(adminPath(actor.restaurantSlug, "/orders"));
    revalidatePath(adminPath(actor.restaurantSlug, `/orders/${order.orderNumber}`));
    revalidatePath(adminPath(actor.restaurantSlug, "/kitchen"));
    revalidatePath(adminPath(actor.restaurantSlug));

    after(() => dispatchDueNotifications({ restaurantId: actor.restaurantId }, { restaurantId: actor.restaurantId }));
    return order;
  });
}
