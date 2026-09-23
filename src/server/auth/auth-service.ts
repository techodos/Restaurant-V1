import { errors } from "@/server/errors";
import { checkRateLimit } from "@/server/rate-limit";
import { can, effectivePermissions, type Permission } from "./permissions";
import type { TeamRole } from "@/shared/contract/enums";
import type { RequestContext } from "@/server/context";
import { getDb } from "@/server/db/registry";
import { mapTeamMember, str, type Row } from "@/server/db/mappers";
import { getRestaurantBySlug } from "@/server/repositories/restaurants";
import { getCustomerById } from "@/server/repositories/customers";
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
 * Staff sessions map onto auth.users rows (Supabase-shaped, see 0001) — staff
 * accounts are managed by the admin-portal branch and created only via
 * `scripts/db/create-staff.ts` (migrator connection, never a live request),
 * since app_service/app_runtime can never get real write access to
 * auth.users (confirmed twice — see DECISIONS.md §24/§25/§26). Customer
 * sessions map onto `customers` rows directly (0021): a customer's login is
 * already restaurant-scoped, so it doesn't need a shared identity table at
 * all — see that migration and DECISIONS.md §26.
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

  await db.write({ userId: member.userId, restaurantId: restaurant.id }, async (tx) => {
    await tx.query(`update team_members set last_login_at = now() where id = $1`, [member.id]);
    await tx.query(`update auth.users set last_sign_in_at = now() where id = $1`, [member.userId]);
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
      `select id, password_hash, full_name from customers
        where restaurant_id = $1 and lower(email) = lower($2) and not is_guest`,
      [restaurant.id, email.trim()],
    ),
  );

  const passwordOk = await verifyPassword(password, row?.password_hash ? str(row.password_hash) : null);
  if (!row || !passwordOk) throw errors.unauthorized("Invalid email or password.");

  const token = await signCustomerSession({
    sub: str(row.id),
    customerId: str(row.id),
    restaurantId: restaurant.id,
    name: str(row.full_name),
  });
  return { token, maxAge: SESSION_TTL.customer, customerId: str(row.id) };
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

  const customerId = await getDb({ restaurantId: restaurant.id }).write({ restaurantId: restaurant.id }, async (tx) => {
    const existing = await tx.queryOne<Row>(
      `select id from customers where restaurant_id = $1 and lower(email) = lower($2) and not is_guest`,
      [restaurant.id, input.email.trim()],
    );
    if (existing) throw errors.conflict("An account with that email already exists.");

    const row = await tx.queryOne<Row>(
      `insert into customers (restaurant_id, full_name, email, phone, password_hash, is_guest)
       values ($1,$2,$3,$4,$5,false)
       on conflict (restaurant_id, phone) do update set
         full_name = excluded.full_name, email = excluded.email, password_hash = excluded.password_hash, is_guest = false
       returning id`,
      [restaurant.id, input.fullName, input.email.trim().toLowerCase(), input.phone.trim(), hashed],
    );
    if (!row) throw errors.internal("Unable to create the account");
    return str(row.id);
  });

  const token = await signCustomerSession({
    sub: customerId,
    customerId,
    restaurantId: restaurant.id,
    name: input.fullName,
  });
  return { token, maxAge: SESSION_TTL.customer, customerId };
}

export interface StorefrontCustomer {
  customerId: string;
  name: string;
  userId: string;
}

/**
 * The signed-in customer for a restaurant, or null when the session belongs elsewhere.
 *
 * Looks up by `session.customerId` (already known from the JWT) — `customers`'
 * RLS policy (`customers_self`, 0006) is `id = app.current_customer_id()`, which
 * only `app.current_customer_id` (set from `ctx.customerId`) can satisfy. A bare
 * lookup with no `customerId` in context is RLS-blocked on every row regardless
 * of what it filters on — that bug silently signed every customer back out on
 * their next page load (confirmed 2026-09-23, Google sign-in landing back on
 * /account/sign-in). `StorefrontCustomer.userId` is `customer.id` — since 0021 a
 * customer's login is the `customers` row itself, no separate user id exists;
 * the field name is kept so `getVisitorContext`/checkout/orders callers that
 * read `visitor.userId` as "who's signed in" don't all need touching.
 */
export async function resolveCustomer(
  session: CustomerSessionPayload,
  restaurantId: string,
): Promise<StorefrontCustomer | null> {
  if (session.restaurantId !== restaurantId) return null;
  const customer = await getCustomerById(session.customerId, { customerId: session.customerId, restaurantId });
  if (!customer || customer.restaurantId !== restaurantId) return null;
  return { customerId: customer.id, name: customer.fullName, userId: customer.id };
}

export function requestContextFrom(actor: StaffActor | null, extra: Partial<RequestContext> = {}): RequestContext {
  return {
    userId: actor?.userId ?? null,
    restaurantId: actor?.restaurantId ?? null,
    actor: actor?.name ?? null,
    ...extra,
  };
}
