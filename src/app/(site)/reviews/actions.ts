"use server";

import { revalidatePath } from "next/cache";
import type { ApiResult } from "@/shared/contract/api";
import { action } from "@/server/errors";
import { requireRestaurant } from "@/server/services/restaurants";
import { submitReview } from "@/server/services/reviews";
import { submitReviewSchema } from "@/server/validation/review";
import { checkRateLimit } from "@/server/rate-limit";
import { callerIdentifier, getVisitorContext } from "@/web/session";
import { assertInstanceRestaurant } from "@/web/instance";

/** Review submission: parse input, delegate to the review service (which moderates). */
export async function submitReviewAction(slug: string, payload: unknown): Promise<ApiResult<{ status: string }>> {
  return action(async () => {
    const input = submitReviewSchema.parse(payload);
    // reviews need a completed order the caller owns (submitReview); still cap how fast one caller can try
    checkRateLimit({ key: "review-submit", identifier: await callerIdentifier(), limit: 5, windowMs: 10 * 60_000 });
    const restaurant = await requireRestaurant(assertInstanceRestaurant(slug));
    const visitor = await getVisitorContext(restaurant.id);
    const review = await submitReview(restaurant, input, visitor);

    revalidatePath(`/reviews`);
    return { status: review.status };
  });
}
