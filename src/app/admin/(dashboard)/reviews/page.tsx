import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { listReviewsForAdmin } from "@/server/services/reviews";
import { REVIEW_STATUS_LABELS, type ReviewStatus } from "@/shared/contract/enums";
import { cn } from "@/shared/utils";
import { getAdminRestaurant } from "@/web/admin";
import { requirePermission } from "@/web/session";
import { RatingStars } from "@/components/storefront/rating-stars";
import { ReviewModerationControl } from "@/components/admin/review-moderation-control";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reviews" };

const TABS: { key: "pending" | "approved" | "rejected" | "all"; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

function badgeVariant(status: ReviewStatus): "warning" | "success" | "danger" {
  if (status === "approved") return "success";
  if (status === "rejected") return "danger";
  return "warning";
}

interface ReviewsPageProps {
  searchParams: Promise<{ status?: string; page?: string }>;
}

export default async function AdminReviewsPage({ searchParams }: ReviewsPageProps) {
  const actor = await requirePermission("reviews.view");
  const restaurant = await getAdminRestaurant();
  const { status, page } = await searchParams;
  const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
  const canManage = actor.permissions.includes("reviews.manage");

  const activeStatus = (status ?? "pending") as "pending" | "approved" | "rejected" | "all";
  const pageNum = Number.parseInt(page ?? "1", 10) || 1;

  const result = await listReviewsForAdmin(restaurant.id, { status: activeStatus, page: pageNum, pageSize: 20 }, ctx);

  const linkFor = (params: { status?: string; page?: number }) => {
    const search = new URLSearchParams();
    search.set("status", params.status ?? activeStatus);
    if (params.page && params.page > 1) search.set("page", String(params.page));
    return `/admin/reviews?${search.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">Reviews</h1>
        <p className="mt-1 text-[var(--color-muted-ink)]">{result.total} total</p>
      </div>

      <nav className="-mx-1 flex snap-x gap-2 overflow-x-auto pb-1">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={linkFor({ status: tab.key })}
            className={cn(
              "snap-start whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm transition-colors",
              activeStatus === tab.key
                ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-[var(--color-brand-foreground)]"
                : "border-[var(--color-hairline)] bg-[var(--color-surface)] hover:border-[var(--color-brand)]",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {result.rows.length === 0 ? (
        <Card>
          <p className="p-8 text-center text-sm text-[var(--color-muted-ink)]">No reviews match this filter.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {result.rows.map((review) => (
            <Card key={review.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <RatingStars rating={review.rating} size="sm" />
                    <span className="font-medium">{review.authorName}</span>
                    <Badge variant={badgeVariant(review.status)}>{REVIEW_STATUS_LABELS[review.status]}</Badge>
                    {review.isFeatured ? <Badge variant="soft">Featured</Badge> : null}
                  </div>
                  {review.itemName ? <p className="mt-1 text-xs text-[var(--color-muted-ink)]">{review.itemName}</p> : null}
                </div>
                <span className="text-xs text-[var(--color-muted-ink)]">
                  {new Date(review.createdAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </div>

              {review.title ? <p className="mt-3 font-medium">{review.title}</p> : null}
              {review.comment ? <p className="mt-1 text-sm text-[var(--color-muted-ink)]">{review.comment}</p> : null}

              {review.response ? (
                <p className="mt-3 rounded-[var(--radius-brand)] bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)] p-3 text-sm">
                  <span className="font-medium">{restaurant.name} replied: </span>
                  {review.response}
                </p>
              ) : null}

              {canManage ? (
                <div className="mt-4 border-t border-[var(--color-hairline)] pt-4">
                  <ReviewModerationControl
                    reviewId={review.id}
                    status={review.status}
                    isFeatured={review.isFeatured}
                    response={review.response}
                  />
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      {result.totalPages > 1 ? (
        <div className="flex items-center justify-center gap-3">
          <Button asChild variant="outline" size="sm" className={pageNum <= 1 ? "pointer-events-none opacity-40" : ""}>
            <Link href={linkFor({ page: pageNum - 1 })} aria-disabled={pageNum <= 1}>
              Previous
            </Link>
          </Button>
          <span className="text-sm text-[var(--color-muted-ink)]">
            Page {pageNum} of {result.totalPages}
          </span>
          <Button
            asChild
            variant="outline"
            size="sm"
            className={pageNum >= result.totalPages ? "pointer-events-none opacity-40" : ""}
          >
            <Link href={linkFor({ page: pageNum + 1 })} aria-disabled={pageNum >= result.totalPages}>
              Next
            </Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}
