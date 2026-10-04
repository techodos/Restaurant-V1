import type { RequestContext } from "@/server/context";
import { errors } from "@/server/errors";
import { logger } from "@/server/logger";
import { createSupabaseAuthUser, supabaseAuthAdminAvailable } from "@/server/integrations/supabase-auth";
import { invalidateStaffActors } from "@/server/auth/auth-service";
import {
  attachTeamMemberToUser,
  createTeamMember,
  deleteTeamMember,
  listTeamMembers,
  setTeamMemberActive,
  updateTeamMember,
} from "@/server/repositories/team";
import type { TeamMember } from "@/shared/contract/models";
import type { CreateTeamMemberInput, UpdateTeamMemberInput } from "@/server/validation/team";

/** Staff list for the admin "Staff" page. */
export function getTeamMembers(restaurantId: string, ctx: RequestContext): Promise<TeamMember[]> {
  return listTeamMembers(restaurantId, ctx);
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
export async function addTeamMember(restaurantId: string, input: CreateTeamMemberInput, ctx: RequestContext): Promise<TeamMember> {
  const repoInput = {
    email: input.email,
    fullName: input.fullName,
    phone: input.phone || null,
    role: input.role,
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

export async function editTeamMember(memberId: string, input: UpdateTeamMemberInput, ctx: RequestContext): Promise<TeamMember> {
  const member = await updateTeamMember(memberId, { fullName: input.fullName, phone: input.phone || null, role: input.role }, ctx);
  invalidateStaffActors();
  return member;
}

export async function setStaffActive(memberId: string, isActive: boolean, ctx: RequestContext): Promise<void> {
  await setTeamMemberActive(memberId, isActive, ctx);
  invalidateStaffActors();
}

export async function removeTeamMember(memberId: string, ctx: RequestContext): Promise<void> {
  await deleteTeamMember(memberId, ctx);
  invalidateStaffActors();
}
