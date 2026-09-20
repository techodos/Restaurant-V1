import type { RatingBreakdown, Restaurant, Review } from "@/shared/contract/models";
import { errors } from "@/server/errors";
import { forRestaurant, type RequestContext } from "@/server/context";
import { getOrderByNumber } from "@/server/repositories/orders";
import { createReview, getRatingBreakdown, hasReviewedOrder, listPublicReviews } from "@/server/repositories/reviews";
import type { SubmitReviewInput } from "@/server/validation/review";

/**
 * Review submission with moderation.
 * A review tied to an order is only accepted when the caller can already read
 * that order (cart cookie / signed-in customer), and each order can be reviewed
 * once. New reviews always land in the moderation queue.
 */
export async function submitReview(restaurant: Restaurant, input: SubmitReviewInput, visitor: RequestContext): Promise<Review> {
  if (!restaurant.features.reviews) {
    throw errors.custom("ORDERING_DISABLED", "Reviews are turned off for this restaurant.");
  }

  let orderId: string | null = null;
  let menuItemId: string | null = input.menuItemId || null;
  if (input.orderNumber) {
    const order = await getOrderByNumber(restaurant.id, input.orderNumber, {
      restaurantId: restaurant.id,
      cartToken: visitor.cartToken ?? null,
      customerId: visitor.customerId ?? null,
      userId: visitor.userId ?? null,
    });
    if (!order) {
      throw errors.forbidden(
        "We could not match that order number to this device. Reviews for an order can only be left from the device that placed it.",
      );
    }
    if (order.status !== "completed") {
      throw errors.validation("You can review an order once it has been completed.");
    }
    const reviewCtx = forRestaurant(restaurant.id, visitor.customerId ? { customerId: visitor.customerId } : {});
    if (await hasReviewedOrder(order.id, reviewCtx)) {
      throw errors.conflict("You have already reviewed this order.");
    }
    orderId = order.id;
    menuItemId = menuItemId ?? order.items?.[0]?.menuItemId ?? null;
  }

  return createReview(
    {
      restaurantId: restaurant.id,
      customerId: visitor.customerId ?? null,
      orderId,
      menuItemId,
      authorName: input.authorName,
      rating: input.rating,
      title: input.title || null,
      comment: input.comment,
      status: "pending",
    },
    { restaurantId: restaurant.id, cartToken: null },
  );
}

export function getPublicReviews(restaurantId: string, filters: { limit?: number; featuredOnly?: boolean } = {}): Promise<Review[]> {
  return listPublicReviews(restaurantId, filters, forRestaurant(restaurantId));
}

export function getReviewSummary(restaurantId: string): Promise<RatingBreakdown> {
  return getRatingBreakdown(restaurantId, forRestaurant(restaurantId));
}
