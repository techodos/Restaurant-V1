import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Reviews come from completed orders only (owner decision 2026-10-26): the public action used to accept a review
 * with no order at all, and a `menuItemId` from the browser that could be any dish of any restaurant. DB-free.
 */
const { store } = vi.hoisted(() => ({
  store: { order: null as Record<string, unknown> | null, created: [] as Record<string, unknown>[] },
}));

vi.mock("@/server/repositories/reviews", () => ({
  createReview: vi.fn(async (input: Record<string, unknown>) => {
    store.created.push(input);
    return { id: "r1", ...input };
  }),
  hasReviewedOrder: vi.fn(async () => false),
  getRatingBreakdown: vi.fn(),
  listPublicReviews: vi.fn(),
  listReviews: vi.fn(),
  moderateReview: vi.fn(),
}));
vi.mock("@/server/services/orders", () => ({ findVisitorOrder: vi.fn(async () => store.order) }));

import { submitReview } from "@/server/services/reviews";
import { submitReviewSchema } from "@/server/validation/review";

const restaurant = { id: "11111111-1111-4111-8111-111111111111", features: { reviews: true } } as never;
const visitor = { customerId: "22222222-2222-4222-8222-222222222222" };
const DISH_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const DISH_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const FOREIGN = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"; // e.g. another restaurant's dish
const review = { authorName: "Sana", rating: 5, comment: "Lovely dinner, will be back." };

beforeEach(() => {
  store.order = { id: "o1", status: "completed", locationId: "branch-lahore", items: [{ menuItemId: DISH_A }, { menuItemId: DISH_B }] };
  store.created = [];
});

describe("submitting a review", () => {
  it("refuses a review without an order, at the schema", () => {
    expect(submitReviewSchema.safeParse(review).success).toBe(false);
    expect(submitReviewSchema.safeParse({ ...review, orderNumber: "" }).success).toBe(false);
    expect(submitReviewSchema.safeParse({ ...review, orderNumber: "AB12-CD34E" }).success).toBe(true);
  });

  it("refuses a review without an order, at the service (a caller that skips the schema)", async () => {
    await expect(submitReview(restaurant, review as never, visitor)).rejects.toThrow();
    expect(store.created).toHaveLength(0);
  });

  it("refuses an order this visitor cannot read, and one that is not completed", async () => {
    store.order = null;
    await expect(submitReview(restaurant, { ...review, orderNumber: "AB12-CD34E" } as never, visitor)).rejects.toThrow(/could not match/i);
    store.order = { id: "o1", status: "preparing", items: [{ menuItemId: DISH_A }] };
    await expect(submitReview(restaurant, { ...review, orderNumber: "AB12-CD34E" } as never, visitor)).rejects.toThrow(/completed/i);
    expect(store.created).toHaveLength(0);
  });

  it("links the review to a dish of that order: a dish from the order is kept, anything else is ignored", async () => {
    await submitReview(restaurant, { ...review, orderNumber: "AB12-CD34E", menuItemId: DISH_B } as never, visitor);
    await submitReview(restaurant, { ...review, orderNumber: "AB12-CD34E", menuItemId: FOREIGN } as never, visitor);
    await submitReview(restaurant, { ...review, orderNumber: "AB12-CD34E" } as never, visitor);
    expect(store.created.map((row) => [row.orderId, row.menuItemId])).toEqual([
      ["o1", DISH_B],
      ["o1", DISH_A],
      ["o1", DISH_A],
    ]);
  });

  it("belongs to the branch that served the order, so only that branch's staff see and moderate it (2026-10-27)", async () => {
    await submitReview(restaurant, { ...review, orderNumber: "AB12-CD34E" } as never, visitor);
    expect(store.created[0]).toMatchObject({ orderId: "o1", locationId: "branch-lahore" });
  });
});
