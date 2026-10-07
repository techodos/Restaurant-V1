import type { RequestContext } from "@/server/context";
import { errors } from "@/server/errors";
import { logger } from "@/server/logger";
import { createSupabaseAuthUser, supabaseAuthAdminAvailable } from "@/server/integrations/supabase-auth";
import { invalidateStaffActors } from "@/server/auth/auth-service";
import { assignableRoles, isBranchRole } from "@/server/auth/permissions";
import { canManageMember, memberBranch, type ScopedActor } from "@/server/auth/branch-scope";
import {
  attachTeamMemberToUser,
  createTeamMember,
  deleteTeamMember,
  getTeamMember,
  getTeamMemberByEmail,
  listTeamMembers,
  setTeamMemberActive,
  updateTeamMember,
} from "@/server/repositories/team";
import { listLocations } from "@/server/repositories/restaurants";
import type { TeamRole } from "@/shared/contract/enums";
import type { TeamMember } from "@/shared/contract/models";
import type { CreateTeamMemberInput, UpdateTeamMemberInput } from "@/server/validation/team";

/** Who is acting on the Staff screen (a StaffActor fits). */
type TeamActor = ScopedActor & { userId: string };

/**
 * Staff list for the admin "Staff" page. `locationId` = the admin's branch scope: a branch manager always
 * gets only their branch's members; owner/admin get the chosen branch's members, or everyone (null).
 */
export function getTeamMembers(restaurantId: string, ctx: RequestContext, locationId: string | null = null): Promise<TeamMember[]> {
  return listTeamMembers(restaurantId, ctx, locationId);
}

/**
 * The branch a member with `role` gets. Owner/admin: none (restaurant-wide). Manager/staff: a branch
 * manager's hires always get the manager's branch (whatever the request said); owner/admin pick one of
 * this restaurant's branches, required when the restaurant has any.
 */
async function branchFor(
  restaurantId: string,
  role: TeamRole,
  requested: string | null | undefined,
  actor: TeamActor,
  ctx: RequestContext,
): Promise<string | null> {
  if (!isBranchRole(role)) return null;
  const own = memberBranch(actor);
  if (own !== null) {
    if (requested && requested !== own) throw errors.forbidden("You can only add staff to your own branch.");
    return own;
  }
  const locations = await listLocations(restaurantId, ctx);
  if (locations.length === 0) return null;
  if (!requested) throw errors.validation("Choose the branch this person works at.", { locationId: "Choose a branch." });
  if (!locations.some((location) => location.id === requested)) throw errors.notFound("Branch");
  return requested;
}

function assertAssignable(actor: TeamActor, role: TeamRole): void {
  if (!assignableRoles(actor.role).includes(role)) throw errors.forbidden("You can't give that role.");
}

async function requireManageable(restaurantId: string, memberId: string, actor: TeamActor, ctx: RequestContext): Promise<TeamMember> {
  const member = await getTeamMember(restaurantId, memberId, ctx);
  if (!member) throw errors.notFound("Team member");
  if (!canManageMember(actor, member)) throw errors.forbidden("You can't change this team member.");
  return member;
}

interface PgLikeError {
  code?: string;
  message?: string;
}
const isPgPermissionDenied = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as PgLikeError).code === "42501";

/**
 * Creates a staff login + team_members row. Works directly on a local/plain Postgres database. On
 * hosted Supabase this app's `app_service` role does not have real INSERT privilege on `auth.users`
 * (only `supabase_auth_admin`/GoTrue does — see SKILL.md section 17/23 and DECISIONS.md section 26,
 * confirmed by a live test), so a BRAND NEW email fails the direct insert with Postgres error 42501.
 * When that happens and the Supabase Auth Admin API is configured (`config.storage.supabase` — the
 * same `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` Storage already uses, no new secret),
 * this falls back to creating the login through that HTTP API instead of SQL, then finishes the
 * `team_members` row with the id it returns (`attachTeamMemberToUser`, which never touches
 * `auth.users`). Only when neither path works (local dev with no Supabase configured and somehow still
 * permission-denied, which should not happen) does this surface the CLI fallback message. Adding a
 * team member whose email **already has** an `auth.users` row (e.g. a manager added to a second
 * restaurant) never hits either fallback — `createTeamMember`'s own existing-user branch handles it.
 */
export async function addTeamMember(
  restaurantId: string,
  input: CreateTeamMemberInput,
  ctx: RequestContext,
  actor: TeamActor,
): Promise<TeamMember> {
  assertAssignable(actor, input.role);
  const [locationId, existing] = await Promise.all([
    branchFor(restaurantId, input.role, input.locationId, actor, ctx),
    getTeamMemberByEmail(restaurantId, input.email.trim(), ctx),
  ]);
  if (existing) throw errors.conflict("This email is already on the team. Edit that member instead.");
  const repoInput = {
    email: input.email,
    fullName: input.fullName,
    phone: input.phone || null,
    role: input.role,
    locationId,
    password: input.password,
  };
  try {
    const member = await createTeamMember(restaurantId, repoInput, ctx);
    invalidateStaffActors(); // a login that was refused moments ago must not stay cached as "not a member"
    return member;
  } catch (error) {
    if (!isPgPermissionDenied(error)) throw error;

    if (supabaseAuthAdminAvailable()) {
      const userId = await createSupabaseAuthUser({ email: input.email, password: input.password, name: input.fullName });
      const member = await attachTeamMemberToUser(restaurantId, userId, repoInput, ctx);
      invalidateStaffActors();
      return member;
    }

    logger.warn("db", "staff creation blocked by hosted database grants (see SKILL.md section 17/23)", String(error));
    throw errors.conflict(
      `Could not create a new login for this email on this database. Ask whoever has server access to run: ` +
        `npm run db:create-staff -- --email ${input.email} --name "${input.fullName}" --role ${input.role} --password "<temporary password>" --restaurant <slug>`,
    );
  }
}

// Every team write clears the cached staff lookups (auth-service#authenticateStaff), so a changed role,
// a deactivation or a removal applies on this instance's very next page view, not after the cache TTL.

/**
 * Edits a member. Your own row: name and phone only (no promoting yourself, no moving your own branch).
 * Anyone else: only members you may manage (canManageMember), only to a role you may give, and a branch
 * manager can never move someone to another branch.
 */
export async function editTeamMember(
  restaurantId: string,
  input: UpdateTeamMemberInput,
  ctx: RequestContext,
  actor: TeamActor,
): Promise<TeamMember> {
  const target = await getTeamMember(restaurantId, input.id, ctx);
  if (!target) throw errors.notFound("Team member");
  const details = { fullName: input.fullName, phone: input.phone || null };

  if (target.userId !== null && target.userId === actor.userId) {
    if (input.role !== target.role || (input.locationId !== undefined && input.locationId !== target.locationId)) {
      throw errors.forbidden("You can't change your own role or branch.");
    }
    const member = await updateTeamMember(target.id, details, ctx);
    invalidateStaffActors();
    return member;
  }

  if (!canManageMember(actor, target)) throw errors.forbidden("You can't change this team member.");
  assertAssignable(actor, input.role);
  // keep the current branch when the form did not send one and the role still needs one
  const requested = input.locationId !== undefined ? input.locationId : target.locationId;
  const locationId = await branchFor(restaurantId, input.role, requested, actor, ctx);
  const member = await updateTeamMember(target.id, { ...details, role: input.role, locationId }, ctx);
  invalidateStaffActors();
  return member;
}

export async function setStaffActive(restaurantId: string, memberId: string, isActive: boolean, ctx: RequestContext, actor: TeamActor): Promise<void> {
  await requireManageable(restaurantId, memberId, actor, ctx);
  await setTeamMemberActive(memberId, isActive, ctx);
  invalidateStaffActors();
}

export async function removeTeamMember(restaurantId: string, memberId: string, ctx: RequestContext, actor: TeamActor): Promise<void> {
  await requireManageable(restaurantId, memberId, actor, ctx);
  await deleteTeamMember(memberId, ctx);
  invalidateStaffActors();
}
