import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { StorefrontContext } from "@/shared/contract/models";
import type { ReviewsSection as ReviewsConfig } from "@/shared/contract/sections";
import { RatingStars } from "@/components/storefront/rating-stars";
import { SectionHeading } from "@/components/storefront/section-heading";
import { SectionShell } from "@/components/storefront/section-shell";
import { getPublicReviews, getReviewSummary } from "@/server/services/reviews";

/** Masonry wall of approved reviews, opened by the restaurant's real rating summary. */
export async function ReviewsSection({ section, context }: { section: ReviewsConfig; context: StorefrontContext }) {
  const [reviews, breakdown] = await Promise.all([
    getPublicReviews(context.restaurant.id, { limit: section.limit }),
    getReviewSummary(context.restaurant.id),
  ]);

  if (!reviews.length) return null;
  const reviewsHref = `/r/${context.restaurant.slug}/reviews`;

  return (
    <SectionShell>
      <div className="flex flex-wrap items-end justify-between gap-6">
        <SectionHeading title={section.title} subtitle={section.subtitle} />
        {section.showCta ? (
          <Link
            href={reviewsHref}
            className="group inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-brand)]"
          >
            Read all reviews
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        ) : null}
      </div>

      <div className="mt-10 columns-1 gap-5 md:columns-2 lg:columns-3 [&>*]:mb-5">
        {breakdown.count ? (
          <div className="break-inside-avoid rounded-[var(--radius-card)] bg-[var(--color-brand-secondary)] p-7 text-white">
            <p className="tabular font-[family-name:var(--font-display)] text-6xl font-semibold leading-none tracking-[-0.03em]">
              {breakdown.average.toFixed(1)}
            </p>
            <RatingStars rating={breakdown.average} size="md" className="mt-4" />
            <p className="mt-3 text-sm text-white/75">
              From {breakdown.count} verified review{breakdown.count === 1 ? "" : "s"}
            </p>
          </div>
        ) : null}

        {reviews.map((review) => (
          <figure key={review.id} className="surface-flat break-inside-avoid p-6">
            <RatingStars rating={review.rating} />
            {review.title ? <p className="mt-4 text-base font-semibold leading-snug">{review.title}</p> : null}
            {review.comment ? (
              <blockquote className="mt-2 line-clamp-4 text-[15px] leading-relaxed text-[var(--color-muted-ink)]">
                &ldquo;{review.comment}&rdquo;
              </blockquote>
            ) : null}
            <figcaption className="mt-5 flex items-center gap-3 border-t border-[var(--color-hairline)] pt-4">
              <span
                aria-hidden
                className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-brand)] bg-[color-mix(in_srgb,var(--color-brand)_12%,transparent)] text-sm font-semibold text-[var(--color-brand)]"
              >
                {review.authorName.slice(0, 1)}
              </span>
              <span className="min-w-0 text-sm">
                <span className="block font-medium">{review.authorName}</span>
                {review.itemName ? (
                  <span className="block truncate text-xs text-[var(--color-muted-ink)]">Ordered {review.itemName}</span>
                ) : null}
              </span>
            </figcaption>
            {review.response ? (
              <p className="mt-4 rounded-[var(--radius-brand)] bg-[color-mix(in_srgb,var(--color-brand)_7%,transparent)] p-3 text-[13px] leading-relaxed">
                <span className="font-semibold">{context.restaurant.name} replied:</span> {review.response}
              </p>
            ) : null}
          </figure>
        ))}
      </div>
    </SectionShell>
  );
}
