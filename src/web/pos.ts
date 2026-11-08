import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppError, errors, jsonError } from "@/server/errors";
import { effectivePermissions, type Permission } from "@/server/auth/permissions";
import { assertPermission, authenticateStaff, signInStaff, type StaffActor } from "@/server/auth/auth-service";
import { verifyStaffSession } from "@/server/auth/tokens";
import { getAdminRestaurantContext } from "@/server/services/restaurants";
import { isEntitled } from "@/shared/feature-access";
import { assertInstanceRestaurant, instanceRestaurantSlug } from "./instance";
import { POS_COOKIE, SUPER_ADMIN_COOKIE, cookieOptions } from "./cookies";

/**
 * The in-store POS session (/pos). Its own cookie, path /pos (covers the till page and /pos/api/*), so a cashier
 * signs in at the till without an /admin session and an admin session never travels with till requests. A platform
 * super admin's "/" cookie also works here, like in /admin. Membership is re-read for every write (route handlers
 * that are not GET), and the restaurant must be entitled to the POS (restaurants.entitlements.pos).
 */
export const POS_PATH = "/pos";

const getPosSession = cache(async () => {
  const store = await cookies();
  return (await verifyStaffSession(store.get(POS_COOKIE)?.value)) ?? (await verifyStaffSession(store.get(SUPER_ADMIN_COOKIE)?.value));
});

/** Page views and GET routes: the 30 s staff cache is fine (auth-service#authenticateStaff). Writes pass `fresh`. */
export const getPosStaff = cache(async (): Promise<StaffActor | null> => {
  const session = await getPosSession();
  if (!session) return null;
  return authenticateStaff(session, instanceRestaurantSlug(), { fresh: false });
});

async function assertPosEntitled(actor: StaffActor): Promise<void> {
  if (actor.role === "super_admin") return;
  const { restaurant } = await getAdminRestaurantContext(actor.restaurantSlug);
  if (!isEntitled(restaurant.entitlements, "pos")) throw errors.forbidden("The POS is not enabled for this restaurant.");
}

/** Route handlers: the signed-in till user with `permission` (UNAUTHORIZED / FORBIDDEN otherwise). */
export async function requirePosStaff(permission: Permission = "pos.use", options: { fresh?: boolean } = {}): Promise<StaffActor> {
  const session = await getPosSession();
  if (!session) throw errors.unauthorized("Please sign in at the till.");
  const actor = options.fresh
    ? await authenticateStaff(session, instanceRestaurantSlug(), { fresh: true })
    : await getPosStaff();
  if (!actor) throw errors.unauthorized("Please sign in at the till.");
  assertPermission(actor, permission);
  await assertPosEntitled(actor);
  return actor;
}

/** The /pos page: anyone not signed in (or without pos.use) goes to the till's sign-in. */
export async function requirePosPage(): Promise<StaffActor> {
  try {
    return await requirePosStaff("pos.use");
  } catch (error) {
    if (error instanceof AppError && (error.code === "UNAUTHORIZED" || error.code === "FORBIDDEN")) {
      redirect(`${POS_PATH}/login${error.code === "FORBIDDEN" ? "?denied=1" : ""}`);
    }
    throw error;
  }
}

/** Till sign-in (Server Action): same credentials and rate limits as /admin, cookie scoped to /pos. */
export async function signInPosSession(email: string, password: string, identifier = "unknown"): Promise<StaffActor> {
  const { token, maxAge, member, restaurant } = await signInStaff(email, password, assertInstanceRestaurant(instanceRestaurantSlug()), identifier);
  // a platform super admin's session is anchored to their home restaurant: they use their /admin sign-in here
  if (member.role === "super_admin") throw errors.forbidden("Platform admins: sign in at /admin, then open /pos.");
  const actor: StaffActor = {
    userId: member.userId as string,
    email: member.email,
    name: member.fullName,
    restaurantId: restaurant.id,
    restaurantSlug: restaurant.slug,
    role: member.role,
    member,
    permissions: effectivePermissions(member.role, member.permissions),
  };
  assertPermission(actor, "pos.use");
  await assertPosEntitled(actor);
  (await cookies()).set(POS_COOKIE, token, { ...(await cookieOptions(maxAge)), path: POS_PATH });
  return actor;
}

export async function signOutPosSession(): Promise<void> {
  (await cookies()).delete({ name: POS_COOKIE, path: POS_PATH });
}

/** /pos/api route handlers: the ApiResult envelope, never cached (the till keeps its own offline copy). */
export async function posResponse<T>(handler: () => Promise<T>): Promise<Response> {
  try {
    return Response.json({ success: true, data: await handler() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const { body, status } = jsonError(error);
    return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  }
}
