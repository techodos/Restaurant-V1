"use server";

import { headers } from "next/headers";
import type { ApiResult } from "@/shared/contract/api";
import { action } from "@/server/errors";
import { registerPushToken } from "@/server/services/notifications";
import { requireRestaurant } from "@/server/services/restaurants";
import { registerPushTokenSchema } from "@/server/validation/notifications";
import { getVisitorContext } from "@/web/session";

/** Links this browser's push token to the customer who placed the order (ownership is proven by the service). */
export async function registerPushTokenAction(slug: string, payload: unknown): Promise<ApiResult<{ registered: true }>> {
  return action(async () => {
    const input = registerPushTokenSchema.parse(payload);
    const restaurant = await requireRestaurant(slug);
    const visitor = await getVisitorContext(restaurant.id);
    const userAgent = (await headers()).get("user-agent");
    await registerPushToken(restaurant, input, visitor, userAgent);
    return { registered: true as const };
  });
}
