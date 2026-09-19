"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ApiResult } from "@/lib/contract/api";
import { createReview, hasReviewedOrder } from "@/lib/db/reviews";
import { getOrderByNumber } from "@/lib/db/orders";
import { getRestaurantBySlug } from "@/lib/db/restaurants";
import { resolveCustomerFromSession } from "@/lib/auth";
import { action, errors } from "@/lib/errors";

/**
 * Review submission with moderation.
 * A review tied to an order is only accepted when the caller can already read
 * that order (cart cookie / signed-in customer), and each order can be reviewed
 * once. New reviews always land in the moderation queue.
 */

const reviewSchema = z.object({
  orderNumber: z.string().trim().max(40).optional().or(z.literal("")),
  menuItemId: z.string().uuid().optional().or(z.literal("")),
  authorName: z.string().trim().min(2, "Please enter your name.").max(80),
  rating: z.coerce.number().int().min(1, "Please pick a rating.").max(5),
  title: z.string().trim().max(120).optional().or(z.literal("")),
  comment: z.string().trim().min(10, "Please add a few words (10 characters minimum).").max(1200),
});

export async function submitReviewAction(slug: string, payload: unknown): Promise<ApiResult<{ status: string }>> {
  return action(async () => {
    const input = reviewSchema.parse(payload);
    const restaurant = await getRestaurantBySlug(slug);
    if (!restaurant) throw errors.notFound("Restaurant");
    if (!restaurant.features.reviews) {
      throw errors.custom("ORDERING_DISABLED", "Reviews are turned off for this restaurant.");
    }

    const customer = await resolveCustomerFromSession(slug);

    let orderId: string | null = null;
    let menuItemId: string | null = input.menuItemId || null;
    if (input.orderNumber) {
      const order = await getOrderByNumber(restaurant.id, input.orderNumber, {});
      if (!order) {
        throw errors.forbidden("We could not match that order number to this device. Reviews for an order can only be left from the device that placed it.");
      }
      if (order.status !== "completed") {
        throw errors.validation("You can review an order once it has been completed.");
      }
      if (await hasReviewedOrder(order.id, customer ? { customerId: customer.customerId } : {})) {
        throw errors.conflict("You have already reviewed this order.");
      }
      orderId = order.id;
      menuItemId = menuItemId ?? order.items?.[0]?.menuItemId ?? null;
    }

    const review = await createReview(
      {
        restaurantId: restaurant.id,
        customerId: customer?.customerId ?? null,
        orderId,
        menuItemId,
        authorName: input.authorName,
        rating: input.rating,
        title: input.title || null,
        comment: input.comment,
        status: "pending",
      },
      { cartToken: null },
    );

    revalidatePath(`/r/${slug}/reviews`);
    return { status: review.status };
  });
}
