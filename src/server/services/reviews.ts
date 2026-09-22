import type { RatingBreakdown, Restaurant, Review } from "@/shared/contract/models";
import type { ReviewStatus } from "@/shared/contract/enums";
import type { Paginated } from "@/shared/contract/api";
import { getStorefrontCache, readPublicReviews, readReviewSummary, snapshotForRestaurant } from "@/server/cache";
import { errors } from "@/server/errors";
import { forRestaurant, type RequestContext } from "@/server/context";
import {
  createReview,
  getRatingBreakdown,
  hasReviewedOrder,
  listPublicReviews,
  listReviews,
  moderateReview,
  type ReviewListFilters,
} from "@/server/repositories/reviews";
import type { SubmitReviewInput } from "@/server/validation/review";
import { findVisitorOrder } from "./orders";

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
    const order = await findVisitorOrder(restaurant.id, input.orderNumber, visitor, input.accessToken || null);
    if (!order) {
      throw errors.forbidden(
        "We could not match that order to this device. Open the review link from your order email, or leave the review from the device that placed the order.",
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

/** Approved reviews for display; served from the storefront snapshot (database when the cache is off). */
export async function getPublicReviews(restaurantId: string, filters: { limit?: number; featuredOnly?: boolean } = {}): Promise<Review[]> {
  const snapshot = snapshotForRestaurant(restaurantId);
  if (snapshot) return readPublicReviews(snapshot, filters);
  return listPublicReviews(restaurantId, filters, forRestaurant(restaurantId));
}

export async function getReviewSummary(restaurantId: string): Promise<RatingBreakdown> {
  const snapshot = snapshotForRestaurant(restaurantId);
  if (snapshot) return readReviewSummary(snapshot);
  return getRatingBreakdown(restaurantId, forRestaurant(restaurantId));
}

/** Staff moderation queue (admin): every status, not just approved. */
export function listReviewsForAdmin(restaurantId: string, filters: ReviewListFilters, ctx: RequestContext): Promise<Paginated<Review>> {
  return listReviews(restaurantId, filters, ctx);
}

/** Approve/reject/reply/feature a review (admin). Invalidates the storefront cache: approved reviews feed the snapshot. */
export async function moderateReviewForAdmin(
  reviewId: string,
  patch: { status?: ReviewStatus; isFeatured?: boolean; response?: string | null },
  ctx: RequestContext,
): Promise<Review> {
  const review = await moderateReview(reviewId, patch, ctx);
  getStorefrontCache().invalidate();
  return review;
}
