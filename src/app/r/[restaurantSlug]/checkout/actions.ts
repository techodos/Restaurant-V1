"use server";

import { revalidatePath } from "next/cache";
import type { ApiResult } from "@/shared/contract/api";
import { action } from "@/server/errors";
import { placeOrder, type PlaceOrderResult } from "@/server/services/checkout";
import { requireRestaurant } from "@/server/services/restaurants";
import { placeOrderSchema } from "@/server/validation/checkout";
import { getVisitorContext } from "@/web/session";

export type { PlaceOrderResult };

/** Guest checkout: parse input, delegate to the checkout service. */
export async function placeOrderAction(slug: string, payload: unknown): Promise<ApiResult<PlaceOrderResult>> {
  return action(async () => {
    const input = placeOrderSchema.parse(payload);
    const restaurant = await requireRestaurant(slug);
    const visitor = await getVisitorContext(restaurant.id);
    const result = await placeOrder(restaurant, input, visitor);
    revalidatePath(`/r/${slug}`, "layout");
    return result;
  });
}
