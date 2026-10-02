import type { Metadata } from "next";
import { getTeamMembers } from "@/server/services/team";
import { getAdminRestaurant } from "@/web/admin";
import { requirePermission } from "@/web/session";
import { StaffManager } from "@/components/admin/staff-manager";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Staff" };

export default async function AdminStaffPage({ params }: { params: Promise<{ restaurantSlug: string }> }) {
  const { restaurantSlug } = await params;
  const actor = await requirePermission("staff.view", restaurantSlug);
  const restaurant = await getAdminRestaurant(restaurantSlug);

  const members = await getTeamMembers(restaurant.id, { restaurantId: restaurant.id, userId: actor.userId, actor: actor.name });

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Staff" description={`${members.length} team member${members.length === 1 ? "" : "s"}`} />
      <StaffManager members={members} canManage={actor.permissions.includes("staff.manage")} currentUserId={actor.userId} />
    </div>
  );
}
