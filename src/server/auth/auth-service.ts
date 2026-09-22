import { errors } from "@/server/errors";
import { checkRateLimit } from "@/server/rate-limit";
import { can, effectivePermissions, type Permission } from "./permissions";
import type { TeamRole } from "@/shared/contract/enums";
import type { RequestContext } from "@/server/context";
import { getDb } from "@/server/db/registry";
import { mapTeamMember, str, type Row } from "@/server/db/mappers";
import { getRestaurantBySlug } from "@/server/repositories/restaurants";
import { getCustomerByUserId } from "@/server/repositories/customers";
import { hashPassword, verifyPassword } from "./password";
import {
  SESSION_TTL,
  signCustomerSession,
  signStaffSession,
  type CustomerSessionPayload,
  type StaffSessionPayload,
} from "./tokens";
import type { Restaurant, TeamMember } from "@/shared/contract/models";

/**
 * Authentication and authorisation service.
 *
 * Framework-free: it works with verified session payloads and returns tokens.
 * Reading and writing cookies is the delivery layer's job (see web/session.ts).
 * Sessions map onto auth.users rows, which is exactly what the RLS helpers read.
 * To run against Supabase Auth instead, swap the sign-in helpers below for the
 * Supabase equivalents — the rest of the application only depends on `sub`.
 */

export interface StaffActor {
  userId: string;
  email: string;
  name: string;
  restaurantId: string;
  role: TeamRole;
  member: TeamMember;
  permissions: Permission[];
}

/**
 * Resolves the staff member behind a session. `restaurantSlug` narrows the
 * session to a specific tenant so an admin can never operate outside their
 * restaurants.
 */
export async function authenticateStaff(
  session: StaffSessionPayload,
  restaurantSlug?: string,
): Promise<StaffActor | null> {
  const { member, restaurant } = await getDb({ restaurantId: session.restaurantId }).read(
    { userId: session.sub, restaurantId: session.restaurantId },
    async (tx) => {
      const memberRow = await tx.queryOne<Row>(
        `select * from team_members where user_id = $1 and is_active order by created_at limit 1`,
        [session.sub],
      );
      if (!memberRow) return { member: null, restaurant: null };
      const restaurantRow = restaurantSlug
        ? await tx.queryOne<Row>(`select id, slug from restaurants where slug = $1`, [restaurantSlug])
        : await tx.queryOne<Row>(`select id, slug from restaurants where id = $1`, [str(memberRow.restaurant_id)]);
      return {
        member: mapTeamMember(memberRow),
        restaurant: restaurantRow ? { id: str(restaurantRow.id), slug: str(restaurantRow.slug) } : null,
      };
    },
  );

  if (!member || !restaurant) return null;
  if (restaurant.id !== member.restaurantId) {
    // A member may not act on a restaurant they do not belong to.
    return null;
  }

  return {
    userId: session.sub,
    email: member.email,
    name: member.fullName,
    restaurantId: member.restaurantId,
    role: member.role,
    member,
    permissions: effectivePermissions(member.role, member.permissions),
  };
}

/** Server-side authorisation: hiding UI is never enough. */
export function assertPermission(actor: StaffActor, permission: Permission): void {
  if (!can({ role: actor.role, permissions: actor.member.permissions }, permission)) {
    throw errors.forbidden(`Your role (${actor.role}) cannot perform this action.`);
  }
}

export interface SignInResult {
  token: string;
  maxAge: number;
  member: TeamMember;
  restaurant: Restaurant;
}

export async function signInStaff(
  email: string,
  password: string,
  restaurantSlug: string,
  identifier = "unknown",
): Promise<SignInResult> {
  checkRateLimit({ key: "staff-signin", identifier, limit: 8, windowMs: 5 * 60_000 });

  const restaurant = await getRestaurantBySlug(restaurantSlug);
  if (!restaurant) throw errors.unauthorized("Invalid email or password.");

  const db = getDb({ restaurantId: restaurant.id });
  const row = await db.write({}, async (tx) =>
    tx.queryOne<Row>(
      `select tm.*, u.encrypted_password, u.id as auth_user_id
         from team_members tm
         left join auth.users u on u.id = tm.user_id
        where tm.restaurant_id = $1 and lower(tm.email) = lower($2) and tm.is_active`,
      [restaurant.id, email.trim()],
    ),
  );

  const passwordOk = await verifyPassword(password, row?.encrypted_password ? str(row.encrypted_password) : null);
  if (!row || !passwordOk) {
    throw errors.unauthorized("Invalid email or password.");
  }

  const member = mapTeamMember(row);
  if (!member.userId) throw errors.unauthorized("This staff account is not linked to a login yet.");

  // auth.users is Supabase's own protected schema on a hosted project (DECISIONS.md §2:
  // "NEVER attempt to modify the Supabase auth schema") — app_service cannot write to it there,
  // so last-login bookkeeping lives on team_members only.
  await db.write({ userId: member.userId, restaurantId: restaurant.id }, async (tx) => {
    await tx.query(`update team_members set last_login_at = now() where id = $1`, [member.id]);
  });

  const token = await signStaffSession({
    sub: member.userId,
    email: member.email,
    name: member.fullName,
    restaurantId: restaurant.id,
    role: member.role,
  });

  return { token, maxAge: SESSION_TTL.staff, member, restaurant };
}

export interface CustomerSignInResult {
  token: string;
  maxAge: number;
  customerId: string;
}

export async function signInCustomer(
  email: string,
  password: string,
  restaurantSlug: string,
  identifier = "unknown",
): Promise<CustomerSignInResult> {
  checkRateLimit({ key: "customer-signin", identifier, limit: 8, windowMs: 5 * 60_000 });

  const restaurant = await getRestaurantBySlug(restaurantSlug);
  if (!restaurant) throw errors.unauthorized("Invalid email or password.");

  const row = await getDb({ restaurantId: restaurant.id }).write({}, async (tx) =>
    tx.queryOne<Row>(
      `select u.id as user_id, u.encrypted_password, c.id as customer_id, c.full_name
         from auth.users u
         join customers c on c.user_id = u.id and c.restaurant_id = $2
        where lower(u.email) = lower($1)`,
      [email.trim(), restaurant.id],
    ),
  );

  const passwordOk = await verifyPassword(password, row?.encrypted_password ? str(row.encrypted_password) : null);
  if (!row || !passwordOk) throw errors.unauthorized("Invalid email or password.");

  const token = await signCustomerSession({
    sub: str(row.user_id),
    customerId: str(row.customer_id),
    restaurantId: restaurant.id,
    name: str(row.full_name),
  });
  return { token, maxAge: SESSION_TTL.customer, customerId: str(row.customer_id) };
}

/** Guest accounts can be upgraded to a real login without losing history. */
export async function createCustomerAccount(
  input: { restaurantSlug: string; fullName: string; email: string; phone: string; password: string },
  identifier = "unknown",
): Promise<CustomerSignInResult> {
  checkRateLimit({ key: "customer-signup", identifier, limit: 5, windowMs: 15 * 60_000 });

  const restaurant = await getRestaurantBySlug(input.restaurantSlug);
  if (!restaurant) throw errors.notFound("Restaurant");

  const hashed = await hashPassword(input.password);

  const result = await getDb({ restaurantId: restaurant.id }).write({ restaurantId: restaurant.id }, async (tx) => {
    const existingUser = await tx.queryOne<Row>(`select id from auth.users where lower(email) = lower($1)`, [
      input.email.trim(),
    ]);
    if (existingUser) throw errors.conflict("An account with that email already exists.");

    const userRow = await tx.queryOne<Row>(
      `insert into auth.users (email, encrypted_password, raw_user_meta_data)
       values ($1,$2, jsonb_build_object('name', $3::text))
       returning id`,
      [input.email.trim().toLowerCase(), hashed, input.fullName],
    );
    if (!userRow) throw errors.internal("Unable to create the account");
    const userId = str(userRow.id);

    const customerRow = await tx.queryOne<Row>(
      `insert into customers (restaurant_id, user_id, full_name, email, phone, is_guest)
       values ($1,$2,$3,$4,$5,false)
       on conflict (restaurant_id, phone) do update set
         user_id = excluded.user_id, email = excluded.email, full_name = excluded.full_name, is_guest = false
       returning id`,
      [restaurant.id, userId, input.fullName, input.email.trim().toLowerCase(), input.phone.trim()],
    );
    if (!customerRow) throw errors.internal("Unable to create the account");
    return { userId, customerId: str(customerRow.id) };
  });

  const token = await signCustomerSession({
    sub: result.userId,
    customerId: result.customerId,
    restaurantId: restaurant.id,
    name: input.fullName,
  });
  return { token, maxAge: SESSION_TTL.customer, customerId: result.customerId };
}

export interface StorefrontCustomer {
  customerId: string;
  name: string;
  userId: string;
}

/** The signed-in customer for a restaurant, or null when the session belongs elsewhere. */
export async function resolveCustomer(
  session: CustomerSessionPayload,
  restaurantId: string,
): Promise<StorefrontCustomer | null> {
  if (session.restaurantId !== restaurantId) return null;
  const customer = await getCustomerByUserId(session.sub, { userId: session.sub, restaurantId });
  if (!customer || customer.restaurantId !== restaurantId) return null;
  return { customerId: customer.id, name: customer.fullName, userId: session.sub };
}

export function requestContextFrom(actor: StaffActor | null, extra: Partial<RequestContext> = {}): RequestContext {
  return {
    userId: actor?.userId ?? null,
    restaurantId: actor?.restaurantId ?? null,
    actor: actor?.name ?? null,
    ...extra,
  };
}
