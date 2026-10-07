import type { Metadata } from "next";
import { adminPath } from "@/shared/utils";
import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { listReviewsForAdmin } from "@/server/services/reviews";
import { REVIEW_STATUS_LABELS, type ReviewStatus } from "@/shared/contract/enums";
import { getAdminRestaurant } from "@/web/admin";
import { requireAdminPage } from "@/web/session";
import { getAdminBranchScope } from "@/web/admin";
import { RatingStars } from "@/components/storefront/rating-stars";
import { ReviewModerationControl } from "@/components/admin/review-moderation-control";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminStatusTabs } from "@/components/admin/admin-status-tabs";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminPagination } from "@/components/admin/admin-pagination";

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
  params: Promise<{ restaurantSlug: string }>;
  searchParams: Promise<{ status?: string; page?: string }>;
}

export default async function AdminReviewsPage({ params, searchParams }: ReviewsPageProps) {
  const { restaurantSlug } = await params;
  const actor = await requireAdminPage("reviews.view", restaurantSlug);
  const restaurant = await getAdminRestaurant(restaurantSlug);
  const { status, page } = await searchParams;
  const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
  const canManage = actor.permissions.includes("reviews.manage");

  const activeStatus = (status ?? "pending") as "pending" | "approved" | "rejected" | "all";
  const pageNum = Number.parseInt(page ?? "1", 10) || 1;

  const { locationId } = await getAdminBranchScope(restaurantSlug);
  const result = await listReviewsForAdmin(restaurant.id, { status: activeStatus, locationId, page: pageNum, pageSize: 20 }, ctx);

  const linkFor = (params: { status?: string; page?: number }) => {
    const search = new URLSearchParams();
    search.set("status", params.status ?? activeStatus);
    if (params.page && params.page > 1) search.set("page", String(params.page));
    return `${adminPath(restaurantSlug)}/reviews?${search.toString()}`;
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Reviews" description={`${result.total} total`} />

      <AdminStatusTabs options={TABS} active={activeStatus} linkFor={(key) => linkFor({ status: key })} />

      {result.rows.length === 0 ? (
        <Card>
          <AdminEmptyState icon={Star} title="No reviews match this filter." />
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

      <AdminPagination page={pageNum} totalPages={result.totalPages} linkFor={(page) => linkFor({ page })} />
    </div>
  );
}
