import type { Metadata } from "next";
import { getTeamMembers } from "@/server/services/team";
import { getLocations } from "@/server/services/restaurants";
import { assignableRoles } from "@/server/auth/permissions";
import { canManageMember } from "@/server/auth/branch-scope";
import { getAdminBranchScope } from "@/web/admin";
import { requireAdminPage } from "@/web/session";
import { StaffManager } from "@/components/admin/staff-manager";
import { AdminPageHeader } from "@/components/admin/admin-page-header";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Staff" };

/**
 * Team for the branch in scope: a branch manager sees (and manages) only their branch's staff; owner/admin
 * see the branch chosen in the header, or everyone with "All branches". The rules for who may change whom
 * are server-side (services/team.ts); `manageableIds`/`assignableRoles` only shape the buttons.
 */
export default async function AdminStaffPage({ params }: { params: Promise<{ restaurantSlug: string }> }) {
  const { restaurantSlug } = await params;
  const actor = await requireAdminPage("staff.view", restaurantSlug);
  const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };

  const [scope, locations] = await Promise.all([getAdminBranchScope(restaurantSlug), getLocations(actor.restaurantId)]);
  const members = await getTeamMembers(actor.restaurantId, ctx, scope.locationId);
  const canManage = actor.permissions.includes("staff.manage");
  const branchNames = Object.fromEntries(locations.map((location) => [location.id, location.name]));

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Staff"
        description={`${members.length} team member${members.length === 1 ? "" : "s"}${scope.current ? ` · ${scope.current.name}` : scope.choices.length > 1 ? " · all branches" : ""}`}
      />
      <StaffManager
        members={members}
        canManage={canManage}
        currentUserId={actor.userId}
        manageableIds={canManage ? members.filter((member) => canManageMember(actor, member)).map((member) => member.id) : []}
        assignableRoles={canManage ? [...assignableRoles(actor.role)] : []}
        branches={locations
          .filter((location) => location.isActive && (!scope.locked || location.id === scope.locationId))
          .map(({ id, name }) => ({ id, name }))}
        branchNames={branchNames}
        lockedBranchId={scope.locked ? scope.locationId : null}
        defaultBranchId={scope.locationId}
      />
    </div>
  );
}
