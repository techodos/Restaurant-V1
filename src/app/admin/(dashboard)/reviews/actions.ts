"use server";

import { revalidatePath } from "next/cache";
import type { ApiResult } from "@/shared/contract/api";
import type { Review } from "@/shared/contract/models";
import { action } from "@/server/errors";
import { moderateReviewForAdmin } from "@/server/services/reviews";
import { moderateReviewSchema } from "@/server/validation/review";
import { requirePermission } from "@/web/session";

export async function moderateReviewAction(payload: unknown): Promise<ApiResult<Review>> {
  return action(async () => {
    const actor = await requirePermission("reviews.manage");
    const input = moderateReviewSchema.parse(payload);
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };

    const review = await moderateReviewForAdmin(
      input.reviewId,
      { status: input.status, response: input.response || null, isFeatured: input.isFeatured },
      ctx,
    );

    revalidatePath("/admin/reviews");
    return review;
  });
}
