import Link from "next/link";
import type { StorefrontContext } from "@/lib/contract/models";
import type { ReviewsSection as ReviewsConfig } from "@/lib/contract/sections";
import { getRatingBreakdown, listPublicReviews } from "@/lib/db/reviews";
import { EMPTY_CONTEXT } from "@/lib/db/pool";
import { RatingStars } from "../rating-stars";
import { SectionHeading } from "../section-heading";
import { SectionShell } from "../section-shell";

export async function ReviewsSection({ section, context }: { section: ReviewsConfig; context: StorefrontContext }) {
  const [reviews, breakdown] = await Promise.all([
    listPublicReviews(context.restaurant.id, { limit: section.limit }, EMPTY_CONTEXT),
    getRatingBreakdown(context.restaurant.id, EMPTY_CONTEXT),
  ]);

  if (!reviews.length) return null;

  return (
    <SectionShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeading
          title={section.title}
          subtitle={
            section.subtitle ??
            (breakdown.count
              ? `${breakdown.average.toFixed(1)} out of 5 from ${breakdown.count} verified review${breakdown.count === 1 ? "" : "s"}`
              : undefined)
          }
        />
        {section.showCta ? (
          <Link
            href={`/r/${context.restaurant.slug}/reviews`}
            className="text-sm font-medium text-[var(--color-brand)] underline-offset-4 hover:underline"
          >
            Read all reviews →
          </Link>
        ) : null}
      </div>

      <ul className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {reviews.map((review) => (
          <li
            key={review.id}
            className="flex h-full flex-col gap-3 rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-5"
          >
            <RatingStars rating={review.rating} />
            {review.title ? <p className="font-semibold">{review.title}</p> : null}
            {review.comment ? <p className="flex-1 text-sm text-[var(--color-muted-ink)]">“{review.comment}”</p> : null}
            <div className="flex items-center justify-between text-xs text-[var(--color-muted-ink)]">
              <span>{review.authorName}</span>
              {review.itemName ? <span className="truncate">{review.itemName}</span> : null}
            </div>
            {review.response ? (
              <p className="rounded-[var(--radius-brand)] bg-[color-mix(in_srgb,var(--color-brand)_8%,transparent)] p-3 text-xs">
                <span className="font-semibold">{context.restaurant.name} replied:</span> {review.response}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </SectionShell>
  );
}
