import type { Metadata } from "next";
import { ConfiguredPage, configuredPageMetadata, type PageHeading } from "@/components/storefront/configured-page";
import type { StorefrontContext } from "@/shared/contract/models";
import Link from "next/link";
import { getStorefrontCustomer } from "@/web/session";
import { getStorefrontContext } from "@/web/storefront";
import { breadcrumbJsonLd, reviewsJsonLd } from "@/web/seo";
import { JsonLd } from "@/components/storefront/json-ld";
import { RatingStars } from "@/components/storefront/rating-stars";
import { ReviewForm } from "@/components/storefront/review-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getPublicReviews, getReviewSummary } from "@/server/services/reviews";
import { MessageSquareQuote } from "lucide-react";
import { EmptyState } from "@/components/storefront/empty-state";
import { PageHero } from "@/components/storefront/page-hero";
import { resolveImage } from "@/web/media";

interface ReviewsPageProps {
  params: Promise<{ restaurantSlug: string }>;
  searchParams: Promise<{ order?: string; t?: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: ReviewsPageProps): Promise<Metadata> {
  const { restaurantSlug } = await params;
  try {
    const { restaurant } = await getStorefrontContext(restaurantSlug);
    const breakdown = await getReviewSummary(restaurant.id);
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
  const query = await searchParams;
  return (
    <ConfiguredPage
      restaurantSlug={restaurantSlug}
      pageSlug="reviews"
      render={(context, heading) => renderReviews(context, heading, query)}
    />
  );
}

async function renderReviews(
  context: StorefrontContext,
  heading: PageHeading,
  { order, t: accessToken }: Awaited<ReviewsPageProps["searchParams"]>,
) {
  const { restaurant } = context;
  const [reviews, breakdown, customer] = await Promise.all([
    getPublicReviews(restaurant.id, { limit: 50 }),
    getReviewSummary(restaurant.id),
    getStorefrontCustomer(restaurant.id).catch(() => null),
  ]);

  const maxCount = Math.max(1, ...Object.values(breakdown.distribution));
  const spotlight = reviews.find((review) => review.isFeatured && review.comment) ?? null;
  const rest = spotlight ? reviews.filter((review) => review.id !== spotlight.id) : reviews;
  const date = (value: string) =>
    new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

  return (
    <>
      <JsonLd data={reviewsJsonLd(reviews, restaurant)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: restaurant.name, path: `/r/${restaurant.slug}` },
          { name: "Reviews", path: `/r/${restaurant.slug}/reviews` },
        ])}
      />

      <PageHero
        overlay={heading.leading}
        size="sm"
        image={resolveImage(restaurant.coverUrl)}
        eyebrow="Reviews"
        title={heading.title ?? "Guest reviews"}
        subtitle={
          heading.subtitle ??
          (breakdown.count > 0
            ? `${breakdown.count} verified review${breakdown.count === 1 ? "" : "s"} from real orders and bookings.`
            : "No published reviews yet. Be the first to write one.")
        }
        aside={
          breakdown.count > 0 ? (
            <div className="text-white lg:text-right">
              <p className="tabular font-[family-name:var(--font-display)] text-[4.5rem] leading-none md:text-[5.5rem]">
                {breakdown.average.toFixed(1)}
              </p>
              <RatingStars rating={breakdown.average} size="md" className="mt-2 lg:justify-end" />
              <p className="mt-2 text-[13px] text-white/70">out of 5 · {breakdown.count} verified review{breakdown.count === 1 ? "" : "s"}</p>
            </div>
          ) : null
        }
      />

      {spotlight ? (
        <section className="tone-night">
          <figure className="container-page py-12 md:py-16">
            <span aria-hidden className="block font-[family-name:var(--font-display)] text-[5rem] leading-[0.5] text-[var(--color-brand-accent)]">
              &ldquo;
            </span>
            <blockquote className="display-2 mt-5 max-w-4xl md:display-1">{spotlight.comment}</blockquote>
            <figcaption className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-[14px] text-[var(--color-muted-ink)]">
              <span className="font-semibold text-[var(--color-ink)]">{spotlight.authorName}</span>
              <RatingStars rating={spotlight.rating} />
              {spotlight.itemName ? <span>on {spotlight.itemName}</span> : null}
              <Badge variant="soft">Featured</Badge>
            </figcaption>
          </figure>
        </section>
      ) : null}

      <div className="container-page section-y">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-14">
          <aside className="space-y-8 lg:sticky lg:top-[calc(var(--header-h,4.5rem)+2rem)] lg:self-start">
            <div>
              <p className="eyebrow mb-4">How guests rate us</p>
              <ul className="space-y-3 text-sm">
                {([5, 4, 3, 2, 1] as const).map((star) => {
                  const count = breakdown.distribution[star];
                  return (
                    <li key={star} className="flex items-center gap-4">
                      <span className="tabular w-8 text-[var(--color-muted-ink)]">{star}★</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--tint-strong)]">
                        <span
                          className="block h-full rounded-full bg-[var(--color-brand-accent)]"
                          style={{ width: `${(count / maxCount) * 100}%` }}
                        />
                      </span>
                      <span className="tabular w-6 text-right text-[var(--color-muted-ink)]">{count}</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            {order ? (
              <ReviewForm restaurantSlug={restaurant.slug} orderNumber={order} accessToken={accessToken} defaultName={customer?.name ?? ""} />
            ) : (
              <div className="border-t border-[var(--rule)] pt-6">
                <h2 className="display-3">Review your order</h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted-ink)]">
                  Reviews are linked to completed orders, so we can keep them honest. Open your order page to write one.
                </p>
                <Button asChild variant="outline" className="mt-5">
                  <Link href={`/r/${restaurant.slug}/menu`}>Order something first</Link>
                </Button>
              </div>
            )}
          </aside>

          <div>
            {reviews.length === 0 ? (
              <EmptyState icon={MessageSquareQuote} title="No published reviews yet">
                Reviews appear here after the restaurant approves them.
              </EmptyState>
            ) : (
              <ul className="border-b border-[var(--rule)]">
                {rest.map((review) => (
                  <li key={review.id} className="reveal border-t border-[var(--rule)] py-7">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <RatingStars rating={review.rating} />
                      {review.isFeatured ? <Badge variant="soft">Featured</Badge> : null}
                      <span className="text-[12.5px] text-[var(--color-muted-ink)]">{date(review.createdAt)}</span>
                    </div>
                    {review.title ? <h3 className="display-3 mt-4">{review.title}</h3> : null}
                    {review.comment ? (
                      <p className="mt-3 max-w-[62ch] text-[15.5px] leading-relaxed text-[var(--color-muted-ink)]">{review.comment}</p>
                    ) : null}
                    <p className="mt-4 text-[13px]">
                      <span className="font-semibold">{review.authorName}</span>
                      {review.itemName ? <span className="text-[var(--color-muted-ink)]"> · on {review.itemName}</span> : null}
                    </p>
                    {review.response ? (
                      <p className="mt-5 border-l-2 border-[var(--color-brand-accent)] pl-4 text-sm leading-relaxed">
                        <span className="font-semibold">{restaurant.name} replied:</span>{" "}
                        <span className="text-[var(--color-muted-ink)]">{review.response}</span>
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
