"use server";

import { revalidatePath } from "next/cache";
import type { ApiResult } from "@/shared/contract/api";
import { action } from "@/server/errors";
import { requireRestaurant } from "@/server/services/restaurants";
import { submitReview } from "@/server/services/reviews";
import { submitReviewSchema } from "@/server/validation/review";
import { getVisitorContext } from "@/web/session";

/** Review submission: parse input, delegate to the review service (which moderates). */
export async function submitReviewAction(slug: string, payload: unknown): Promise<ApiResult<{ status: string }>> {
  return action(async () => {
    const input = submitReviewSchema.parse(payload);
    const restaurant = await requireRestaurant(slug);
    const visitor = await getVisitorContext(restaurant.id);
    const review = await submitReview(restaurant, input, visitor);

    revalidatePath(`/r/${slug}/reviews`);
    return { status: review.status };
  });
}
