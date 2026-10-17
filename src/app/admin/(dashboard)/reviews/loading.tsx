import { AdminHeaderSkeleton, AdminTabsSkeleton, AdminCardListSkeleton } from "@/components/admin/admin-skeleton";

export default function ReviewsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading reviews">
      <AdminHeaderSkeleton />
      <AdminTabsSkeleton count={4} />
      <AdminCardListSkeleton count={4} />
    </div>
  );
}
