"use server";

import { headers } from "next/headers";
import type { ApiResult } from "@/shared/contract/api";
import { action, errors } from "@/server/errors";
import { registerPushToken } from "@/server/services/notifications";
import { findVisitorOrder, reorderLines, type ReorderResult } from "@/server/services/orders";
import { registerPushTokenSchema } from "@/server/validation/notifications";
import type { TrayLine, TrayLineDisplay } from "@/shared/tray";
import { resolveImage } from "@/web/media";
import { getVisitorContext } from "@/web/session";
import { requireStorefrontRestaurant } from "@/web/storefront";

/** Links this browser's push token to the customer who placed the order (ownership is proven by the service). */
export async function registerPushTokenAction(slug: string, payload: unknown): Promise<ApiResult<{ registered: true }>> {
  return action(async () => {
    const input = registerPushTokenSchema.parse(payload);
    const restaurant = await requireStorefrontRestaurant(slug);
    const visitor = await getVisitorContext(restaurant.id);
    const userAgent = (await headers()).get("user-agent");
    await registerPushToken(restaurant, input, visitor, userAgent);
    return { registered: true as const };
  });
}

export interface ReorderPayload {
  /** lines for the browser to add to its tray cookie, with how to show each */
  lines: { line: TrayLine; display: TrayLineDisplay }[];
  skippedItemNames: string[];
}

/**
 * Re-orders a past order into the visitor's tray. Ownership is proven the same way the order page proves
 * it (findVisitorOrder: signed-in customer or a signed order-access token) — the order number alone
 * proves nothing. Nothing is written: the still-orderable lines come back priced from the current menu
 * and the browser adds them to its tray cookie. Items no longer orderable are skipped, not fatal; the
 * caller shows `skippedItemNames` and sends the visitor to /cart to review before checkout.
 */
export async function reorderAction(
  slug: string,
  orderNumber: string,
  accessToken?: string,
): Promise<ApiResult<ReorderPayload>> {
  return action(async () => {
    const restaurant = await requireStorefrontRestaurant(slug);
    const visitor = await getVisitorContext(restaurant.id);
    const order = await findVisitorOrder(restaurant.id, orderNumber, visitor, accessToken);
    if (!order) throw errors.notFound("Order");
    const result: ReorderResult = await reorderLines(restaurant, order, { ...visitor, restaurantId: restaurant.id });
    return {
      skippedItemNames: result.skippedItemNames,
      lines: result.lines.map((view) => ({
        line: view.line,
        display: {
          name: view.name,
          slug: view.slug,
          imageUrl: resolveImage(view.imageUrl),
          variantName: view.variantName,
          addonNames: view.addons.map((addon) => addon.name),
          unitPrice: view.unitPrice,
          addonsTotal: view.addonsTotal,
          problem: null,
        },
      })),
    };
  });
}
