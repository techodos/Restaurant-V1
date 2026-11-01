"use server";

import type { ApiResult } from "@/shared/contract/api";
import { action } from "@/server/errors";
import { checkRateLimit } from "@/server/rate-limit";
import { sendContactMessage } from "@/server/services/contact";
import { contactMessageSchema } from "@/server/validation/contact";
import { assertInstanceRestaurant } from "@/web/instance";
import { callerIdentifier } from "@/web/session";
import { getStorefrontContext } from "@/web/storefront";

/** Contact section form: parse input, email the restaurant's inbox. */
export async function sendContactMessageAction(slug: string, payload: unknown): Promise<ApiResult<{ sent: true }>> {
  return action(async () => {
    const input = contactMessageSchema.parse(payload);
    checkRateLimit({ key: "contact-message", identifier: await callerIdentifier(), limit: 5, windowMs: 10 * 60_000 });
    const { restaurant, config } = await getStorefrontContext(assertInstanceRestaurant(slug));
    await sendContactMessage(restaurant, config.contact.email ?? restaurant.email ?? null, input);
    return { sent: true as const };
  });
}
