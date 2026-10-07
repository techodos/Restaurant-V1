import { errors } from "@/server/errors";
import { assignableRoles } from "@/server/auth/permissions";
import type { TeamRole } from "@/shared/contract/enums";
import type { RestaurantLocation } from "@/shared/contract/models";

/**
 * Which branch an admin request is about. The source of truth is `team_members.location_id` — the same
 * column RLS reads (`app.member_location_id`, migration 0027) and the write guard checks (0029):
 *   - null  = restaurant-wide (owner/admin, "HQ"): may choose any branch, or all of them;
 *   - an id = branch-scoped (manager/staff): always that branch, whatever the request asks for.
 * Pages, routes and actions call these helpers; none of them trusts a branch id sent by the browser
 * for a branch-scoped member.
 */

export interface ScopedActor {
  role: TeamRole;
  member: { locationId: string | null };
}

/** The member's own branch; null = restaurant-wide. */
export function memberBranch(actor: ScopedActor): string | null {
  return actor.member.locationId;
}

export function isRestaurantWide(actor: ScopedActor): boolean {
  return memberBranch(actor) === null;
}

/** Restaurant-wide data (shared menu, coupons, settings) is changed by restaurant-wide staff only. */
export function assertRestaurantWide(actor: ScopedActor): void {
  if (!isRestaurantWide(actor)) {
    throw errors.forbidden("Only the owner or an administrator can change this — it applies to every branch.");
  }
}

/** Rows at `locationId` (null = not tied to a branch) are inside the actor's reach. */
export function canAccessBranch(actor: ScopedActor, locationId: string | null): boolean {
  const own = memberBranch(actor);
  return own === null || locationId === null || locationId === own;
}

export function assertBranchAccess(actor: ScopedActor, locationId: string | null): void {
  if (!canAccessBranch(actor, locationId)) throw errors.forbidden("That belongs to another branch. You can only change your own branch.");
}

/**
 * May `actor` (who holds `staff.manage`) edit, disable or remove `target`? Only roles they could assign
 * (permissions.ts#assignableRoles), and a branch manager only members of their own branch — never an
 * account with no branch (that is a restaurant-wide account).
 */
export function canManageMember(
  actor: ScopedActor & { userId: string },
  target: { role: TeamRole; locationId: string | null; userId: string | null },
): boolean {
  if (target.userId !== null && target.userId === actor.userId) return false; // never your own account here
  if (!assignableRoles(actor.role).includes(target.role)) return false;
  const own = memberBranch(actor);
  return own === null || target.locationId === own;
}

/** "All branches" in the selector / cookie. */
export const ALL_BRANCHES = "all";

export interface BranchScope {
  /** filter for branch-scoped queries; null = every branch (restaurant-wide view) */
  locationId: string | null;
  /** branch-scoped member: no selector, no way to change it */
  locked: boolean;
  /** branches the selector offers (restaurant-wide staff, 2+ branches) — empty otherwise */
  choices: RestaurantLocation[];
  /** the branch being shown, for labels; null = all branches */
  current: RestaurantLocation | null;
}

/** The restaurant's main branch: the one marked primary, else the first in display order. */
export function primaryBranch(locations: RestaurantLocation[]): RestaurantLocation | null {
  return locations.find((location) => location.isPrimary) ?? locations[0] ?? null;
}

/**
 * Resolves the branch for one request. `requested` is the restaurant-wide member's choice (the admin
 * branch cookie) and is IGNORED for a branch-scoped member. An unknown or inactive choice falls back to
 * the primary branch, so the default is deterministic. With one branch there is nothing to choose and
 * the view stays unfiltered (orders placed before a branch was set keep showing).
 */
export function resolveBranchScope(
  actor: ScopedActor,
  activeLocations: RestaurantLocation[],
  requested: string | null | undefined,
): BranchScope {
  const own = memberBranch(actor);
  if (own !== null) {
    return { locationId: own, locked: true, choices: [], current: activeLocations.find((location) => location.id === own) ?? null };
  }
  if (activeLocations.length <= 1) {
    return { locationId: null, locked: false, choices: [], current: activeLocations[0] ?? null };
  }
  if (requested === ALL_BRANCHES) return { locationId: null, locked: false, choices: activeLocations, current: null };
  const current = activeLocations.find((location) => location.id === requested) ?? primaryBranch(activeLocations);
  return { locationId: current?.id ?? null, locked: false, choices: activeLocations, current };
}
