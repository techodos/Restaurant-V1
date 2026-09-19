import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getRatingBreakdown, listPublicReviews } from "@/lib/db/reviews";
import { EMPTY_CONTEXT } from "@/lib/db/pool";
import { resolveCustomerFromSession } from "@/lib/auth";
import { getStorefrontContext } from "@/lib/services/storefront";
import { breadcrumbJsonLd, reviewsJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/storefront/json-ld";
import { RatingStars } from "@/components/storefront/rating-stars";
import { ReviewForm } from "@/components/storefront/review-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ReviewsPageProps {
  params: Promise<{ restaurantSlug: string }>;
  searchParams: Promise<{ order?: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: ReviewsPageProps): Promise<Metadata> {
  const { restaurantSlug } = await params;
  try {
    const { restaurant } = await getStorefrontContext(restaurantSlug);
    const breakdown = await getRatingBreakdown(restaurant.id, EMPTY_CONTEXT);
    return {
      title: "Reviews",
      description:
        breakdown.count > 0
          ? `${breakdown.average.toFixed(1)} out of 5 from ${breakdown.count} verified reviews at ${restaurant.name}.`
          : `Read guest reviews for ${restaurant.name}.`,
      alternates: { canonical: `/r/${restaurant.slug}/reviews` },
    };
  } catch {
    return { title: "Reviews" };
  }
}

export default async function ReviewsPage({ params, searchParams }: ReviewsPageProps) {
  const { restaurantSlug } = await params;
  const { order } = await searchParams;

  let context;
  try {
    context = await getStorefrontContext(restaurantSlug);
  } catch {
    notFound();
  }

  const { restaurant } = context;
  const [reviews, breakdown, customer] = await Promise.all([
    listPublicReviews(restaurant.id, { limit: 50 }, EMPTY_CONTEXT),
    getRatingBreakdown(restaurant.id, EMPTY_CONTEXT),
    resolveCustomerFromSession(restaurant.slug).catch(() => null),
  ]);

  const maxCount = Math.max(1, ...Object.values(breakdown.distribution));

  return (
    <div className="container-page py-10 md:py-14">
      <JsonLd data={reviewsJsonLd(reviews, restaurant)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: restaurant.name, path: `/r/${restaurant.slug}` },
          { name: "Reviews", path: `/r/${restaurant.slug}/reviews` },
        ])}
      />

      <header className="max-w-2xl">
        <h1 className="text-3xl font-semibold md:text-4xl">Guest reviews</h1>
        <p className="mt-3 text-[var(--color-muted-ink)]">
          {breakdown.count > 0
            ? `${breakdown.count} verified review${breakdown.count === 1 ? "" : "s"} · ${breakdown.average.toFixed(1)} average`
            : "No published reviews yet — be the first to write one."}
        </p>
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_1.4fr] lg:gap-14">
        <aside className="space-y-6">
          <div className="rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-6">
            <p className="font-[family-name:var(--font-heading)] text-4xl font-semibold">{breakdown.average.toFixed(1)}</p>
            <RatingStars rating={breakdown.average} size="md" className="mt-2" />
            <p className="mt-2 text-sm text-[var(--color-muted-ink)]">
              {breakdown.count} review{breakdown.count === 1 ? "" : "s"}
            </p>
            <ul className="mt-5 space-y-2 text-sm">
              {([5, 4, 3, 2, 1] as const).map((star) => {
                const count = breakdown.distribution[star];
                return (
                  <li key={star} className="flex items-center gap-3">
                    <span className="w-8 text-[var(--color-muted-ink)]">{star}★</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--color-ink)_8%,transparent)]">
                      <span
                        className="block h-full rounded-full bg-[var(--color-brand)]"
                        style={{ width: `${(count / maxCount) * 100}%` }}
                      />
                    </span>
                    <span className="w-6 text-right text-[var(--color-muted-ink)]">{count}</span>
                  </li>
                );
              })}
            </ul>
          </div>

          {order ? (
            <ReviewForm restaurantSlug={restaurant.slug} orderNumber={order} defaultName={customer?.name ?? ""} />
          ) : (
            <div className="rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-6">
              <h2 className="text-base font-semibold">Review your order</h2>
              <p className="mt-2 text-sm text-[var(--color-muted-ink)]">
                Reviews are linked to completed orders, so we can keep them honest. Open your order page to write one.
              </p>
              <Button asChild variant="outline" className="mt-4 w-full">
                <Link href={`/r/${restaurant.slug}/menu`}>Order something first</Link>
              </Button>
            </div>
          )}
        </aside>

        <div>
          {reviews.length === 0 ? (
            <div className="rounded-[var(--radius-brand)] border border-dashed border-[var(--color-hairline)] p-12 text-center">
              <p className="font-medium">No published reviews yet</p>
              <p className="mt-2 text-sm text-[var(--color-muted-ink)]">
                Reviews appear here after the restaurant approves them.
              </p>
            </div>
          ) : (
            <ul className="space-y-4">
              {reviews.map((review) => (
                <li
                  key={review.id}
                  className="rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-6"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{review.authorName}</p>
                      <p className="text-xs text-[var(--color-muted-ink)]">
                        {new Date(review.createdAt).toLocaleDateString(undefined, {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {review.isFeatured ? <Badge variant="soft">Featured</Badge> : null}
                      <RatingStars rating={review.rating} />
                    </div>
                  </div>
                  {review.title ? <p className="mt-3 font-semibold">{review.title}</p> : null}
                  {review.comment ? <p className="mt-2 text-sm text-[var(--color-muted-ink)]">{review.comment}</p> : null}
                  {review.itemName ? (
                    <p className="mt-3 text-xs text-[var(--color-muted-ink)]">About: {review.itemName}</p>
                  ) : null}
                  {review.response ? (
                    <p className="mt-4 rounded-[var(--radius-brand)] bg-[color-mix(in_srgb,var(--color-brand)_8%,transparent)] p-3 text-sm">
                      <span className="font-semibold">{restaurant.name} replied:</span> {review.response}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
