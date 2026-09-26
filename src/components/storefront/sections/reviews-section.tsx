import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { StorefrontContext } from "@/shared/contract/models";
import type { ReviewsSection as ReviewsConfig } from "@/shared/contract/sections";
import { RatingStars } from "@/components/storefront/rating-stars";
import { Rail } from "@/components/storefront/rail";
import { SectionShell } from "@/components/storefront/section-shell";
import { getPublicReviews, getReviewSummary } from "@/server/services/reviews";

/**
 * Proof, on the night surface: the restaurant's real average and review count hold the left column,
 * approved reviews run beside it as quote cards in a rail (restaurant replies included).
 */
export async function ReviewsSection({ section, context }: { section: ReviewsConfig; context: StorefrontContext }) {
  const [reviews, breakdown] = await Promise.all([
    getPublicReviews(context.restaurant.id, { limit: section.limit }),
    getReviewSummary(context.restaurant.id),
  ]);
  if (!reviews.length) return null;
  const reviewsHref = `/r/${context.restaurant.slug}/reviews`;

  return (
    <SectionShell tone="night">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,2fr)] lg:gap-12">
        <div className="lg:pt-2">
          <p className="eyebrow mb-3">What our guests say</p>
          <h2 className="display-1">{section.title}</h2>
          {section.subtitle ? <p className="lede mt-3">{section.subtitle}</p> : null}
          {breakdown.count ? (
            <div className="mt-7 flex items-end gap-5 border-t border-[var(--rule)] pt-6">
              <p className="tabular font-[family-name:var(--font-display)] text-[4.25rem] leading-[0.8] text-[var(--color-brand-accent)]">
                {breakdown.average.toFixed(1)}
              </p>
              <div className="pb-0.5">
                <RatingStars rating={breakdown.average} size="md" />
                <p className="tabular mt-1.5 text-[13px] text-[var(--color-muted-ink)]">
                  {breakdown.count} verified review{breakdown.count === 1 ? "" : "s"}
                </p>
              </div>
            </div>
          ) : null}
          {section.showCta ? (
            <Link href={reviewsHref} className="link-arrow mt-6">
              Read every review
              <ArrowRight aria-hidden />
            </Link>
          ) : null}
        </div>

        <Rail label="reviews" itemClassName="w-[86%] sm:w-[calc((100%-1.5rem)/2)] xl:w-[calc((100%-3rem)/3)]">
          {reviews.map((review) => (
            <figure
              key={review.id}
              className="flex h-full flex-col rounded-[var(--radius-card)] border border-[var(--rule)] bg-[var(--color-surface)] p-6 md:p-7"
            >
              <div className="flex items-center gap-3">
                <span
                  aria-hidden
                  className="grid size-10 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-brand-accent)_22%,transparent)] font-[family-name:var(--font-display)] text-lg text-[var(--color-brand-accent)]"
                >
                  {review.authorName.slice(0, 1)}
                </span>
                <div className="min-w-0">
                  <RatingStars rating={review.rating} />
                  {review.itemName ? (
                    <p className="mt-0.5 truncate text-[12px] text-[var(--color-muted-ink)]">on {review.itemName}</p>
                  ) : null}
                </div>
              </div>
              {review.title ? <p className="mt-5 font-semibold">{review.title}</p> : null}
              <blockquote className="mt-2 line-clamp-6 text-[14.5px] leading-relaxed text-[color-mix(in_srgb,var(--color-ink)_88%,transparent)]">
                &ldquo;{review.comment ?? review.title}&rdquo;
              </blockquote>
              {review.response ? (
                <p className="mt-4 border-t border-[var(--rule)] pt-4 text-[12.5px] leading-relaxed text-[var(--color-muted-ink)]">
                  <span className="font-semibold text-[var(--color-ink)]">{context.restaurant.name}:</span> {review.response}
                </p>
              ) : null}
              <figcaption className="mt-auto pt-5 text-[13px] font-semibold">{review.authorName}</figcaption>
            </figure>
          ))}
        </Rail>
      </div>
    </SectionShell>
  );
}
