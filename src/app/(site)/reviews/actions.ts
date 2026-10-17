"use server";

import { revalidatePath } from "next/cache";
import type { ApiResult } from "@/shared/contract/api";
import { action } from "@/server/errors";
import { requireRestaurant } from "@/server/services/restaurants";
import { submitReview } from "@/server/services/reviews";
import { submitReviewSchema } from "@/server/validation/review";
import { checkRateLimit } from "@/server/rate-limit";
import { callerIdentifier, getVisitorContext } from "@/web/session";

/** Review submission: parse input, delegate to the review service (which moderates). */
export async function submitReviewAction(slug: string, payload: unknown): Promise<ApiResult<{ status: string }>> {
  return action(async () => {
    const input = submitReviewSchema.parse(payload);
    // anyone may write a review (it waits for moderation), so cap how fast one caller can fill that queue
    checkRateLimit({ key: "review-submit", identifier: await callerIdentifier(), limit: 5, windowMs: 10 * 60_000 });
    const restaurant = await requireRestaurant(slug);
    const visitor = await getVisitorContext(restaurant.id);
    const review = await submitReview(restaurant, input, visitor);

    revalidatePath(`/r/${slug}/reviews`);
    return { status: review.status };
  });
}
