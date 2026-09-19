import { getDb, type RequestContext } from "./pool";
import { mapReview, num, str, type Row } from "./map";
import type { RatingBreakdown, Review } from "../contract/models";
import type { ReviewStatus } from "../contract/enums";
import { paginate, type Paginated } from "../contract/api";

export interface ReviewListFilters {
  status?: ReviewStatus | "all";
  menuItemId?: string;
  featuredOnly?: boolean;
  limit?: number;
  offset?: number;
  page?: number;
  pageSize?: number;
}

/** Public storefront reviews — RLS already restricts this to approved rows. */
export async function listPublicReviews(
  restaurantId: string,
  filters: { limit?: number; featuredOnly?: boolean } = {},
  ctx: RequestContext = {},
): Promise<Review[]> {
  const params: unknown[] = [restaurantId];
  let where = "r.restaurant_id = $1 and r.status = 'approved'";
  if (filters.featuredOnly) where += " and r.is_featured";
  params.push(Math.min(filters.limit ?? 6, 50));
  const rows = await getDb().query<Row>(
    ctx,
    `select r.*, mi.name as item_name
       from reviews r left join menu_items mi on mi.id = r.menu_item_id
      where ${where}
      order by r.is_featured desc, r.created_at desc
      limit $${params.length}`,
    params,
  );
  return rows.map(mapReview);
}

export async function listReviews(
  restaurantId: string,
  filters: ReviewListFilters,
  ctx: RequestContext,
): Promise<Paginated<Review>> {
  const db = getDb();
  return db.read({ ...ctx, restaurantId }, async (tx) => {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const params: unknown[] = [restaurantId];
    const conditions = ["r.restaurant_id = $1"];
    if (filters.status && filters.status !== "all") {
      params.push(filters.status);
      conditions.push(`r.status = $${params.length}::review_status`);
    }
    if (filters.menuItemId) {
      params.push(filters.menuItemId);
      conditions.push(`r.menu_item_id = $${params.length}`);
    }
    if (filters.featuredOnly) conditions.push("r.is_featured");
    const where = conditions.join(" and ");
    const total = await tx.queryCount(`select count(*) from reviews r where ${where}`, params);
    const rows = await tx.query<Row>(
      `select r.*, mi.name as item_name
         from reviews r left join menu_items mi on mi.id = r.menu_item_id
        where ${where}
        order by r.created_at desc
        limit ${pageSize} offset ${(page - 1) * pageSize}`,
      params,
    );
    return paginate(rows.map(mapReview), total, page, pageSize);
  });
}

export async function getRatingBreakdown(
  restaurantId: string,
  ctx: RequestContext = {},
  menuItemId?: string,
): Promise<RatingBreakdown> {
  const params: unknown[] = [restaurantId];
  let where = "restaurant_id = $1 and status = 'approved'";
  if (menuItemId) {
    params.push(menuItemId);
    where += ` and menu_item_id = $${params.length}`;
  }
  const rows = await getDb().query<Row>(
    ctx,
    `select rating, count(*) as count,
            avg(rating) over () as average,
            count(*) over () as total
       from reviews where ${where} group by rating`,
    params,
  );
  const distribution: RatingBreakdown["distribution"] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let count = 0;
  let average = 0;
  for (const row of rows) {
    const rating = num(row.rating) as 1 | 2 | 3 | 4 | 5;
    if (rating >= 1 && rating <= 5) distribution[rating] = num(row.count);
    count += num(row.count);
    average = num(row.average);
  }
  return { average: Number(average.toFixed(2)), count, distribution };
}

export interface ReviewInput {
  restaurantId: string;
  customerId?: string | null;
  orderId?: string | null;
  menuItemId?: string | null;
  authorName: string;
  authorEmail?: string | null;
  rating: number;
  title?: string | null;
  comment?: string | null;
  /** moderation default: reviews start pending unless the restaurant auto-approves */
  status: ReviewStatus;
}

export async function createReview(input: ReviewInput, ctx: RequestContext): Promise<Review> {
  const db = getDb();
  return db.write({ ...ctx, restaurantId: input.restaurantId }, async (tx) => {
    const row = await tx.queryOne<Row>(
      `insert into reviews
         (restaurant_id, customer_id, order_id, menu_item_id, author_name, author_email, rating, title, comment, status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::review_status)
       returning *`,
      [
        input.restaurantId, input.customerId ?? null, input.orderId ?? null, input.menuItemId ?? null,
        input.authorName, input.authorEmail ?? null, input.rating, input.title ?? null, input.comment ?? null,
        input.status,
      ],
    );
    if (!row) throw new Error("Unable to save the review");
    return mapReview(row);
  });
}

export async function moderateReview(
  reviewId: string,
  patch: { status?: ReviewStatus; isFeatured?: boolean; response?: string | null },
  ctx: RequestContext,
): Promise<Review> {
  const db = getDb();
  return db.write(ctx, async (tx) => {
    const row = await tx.queryOne<Row>(
      `update reviews set
         status = coalesce($2::review_status, status),
         is_featured = coalesce($3, is_featured),
         response = coalesce($4, response),
         responded_at = case when $4 is not null then now() else responded_at end
       where id = $1 returning *`,
      [reviewId, patch.status ?? null, patch.isFeatured ?? null, patch.response ?? null],
    );
    if (!row) throw new Error("Review not found");
    return mapReview(row);
  });
}

export async function deleteReview(reviewId: string, ctx: RequestContext): Promise<void> {
  await getDb().write(ctx, async (tx) => {
    await tx.query(`delete from reviews where id = $1`, [reviewId]);
  });
}

/** True when this phone number already reviewed the same order. */
export async function hasReviewedOrder(orderId: string, ctx: RequestContext = {}): Promise<boolean> {
  const row = await getDb().queryOne<{ count: string }>(
    ctx,
    `select count(*) from reviews where order_id = $1`,
    [orderId],
  );
  return row ? Number.parseInt(row.count, 10) > 0 : false;
}

export async function listCustomerReviews(customerId: string, ctx: RequestContext): Promise<Review[]> {
  const rows = await getDb().query<Row>(
    { ...ctx, customerId },
    `select r.*, mi.name as item_name from reviews r
       left join menu_items mi on mi.id = r.menu_item_id
      where r.customer_id = $1 order by r.created_at desc limit 20`,
    [customerId],
  );
  return rows.map(mapReview);
}
