import { errors } from "@/server/errors";
import { checkRateLimit } from "@/server/rate-limit";
import { can, effectivePermissions, type Permission } from "./permissions";
import type { TeamRole } from "@/shared/contract/enums";
import type { RequestContext } from "@/server/context";
import { getDb } from "@/server/db/registry";
import { mapTeamMember, str, type Row } from "@/server/db/mappers";
import { getRestaurantBySlug } from "@/server/repositories/restaurants";
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
  emailVerified: boolean;
}

/**
 * Customer email/password sign-in: ONE database read (the account row, including its verification
 * state) plus the scrypt check. The restaurant comes from the caller (the storefront snapshot), not a
 * second lookup, and the verification state travels in the session token so the pages that follow
 * never have to ask the database who is signed in.
 */
export async function signInCustomer(
  email: string,
  password: string,
  restaurant: Pick<Restaurant, "id">,
  identifier = "unknown",
): Promise<CustomerSignInResult> {
  checkRateLimit({ key: "customer-signin", identifier, limit: 8, windowMs: 5 * 60_000 });

  const row = await getDb({ restaurantId: restaurant.id }).write({}, async (tx) =>
    tx.queryOne<Row>(
      `select id, password_hash, full_name, is_email_verified from customers
        where restaurant_id = $1 and lower(email) = lower($2) and not is_guest`,
      [restaurant.id, email.trim()],
    ),
  );

  const passwordOk = await verifyPassword(password, row?.password_hash ? str(row.password_hash) : null);
  if (!row || !passwordOk) throw errors.unauthorized("Invalid email or password.");

  const emailVerified = Boolean(row.is_email_verified);
  const token = await signCustomerSession({
    sub: str(row.id),
    customerId: str(row.id),
    restaurantId: restaurant.id,
    name: str(row.full_name),
    emailVerified,
  });
  return { token, maxAge: SESSION_TTL.customer, customerId: str(row.id), emailVerified };
}

/** Guest accounts can be upgraded to a real login without losing history. */
export async function createCustomerAccount(
  input: { restaurant: Pick<Restaurant, "id">; fullName: string; email: string; phone: string; password: string },
  identifier = "unknown",
): Promise<CustomerSignInResult> {
  checkRateLimit({ key: "customer-signup", identifier, limit: 5, windowMs: 15 * 60_000 });

  const { restaurant } = input;
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
    emailVerified: false,
  });
  return { token, maxAge: SESSION_TTL.customer, customerId, emailVerified: false };
}

export interface StorefrontCustomer {
  customerId: string;
  name: string;
  userId: string;
  /** from the session token; `null` for a token signed before the claim existed (unknown) */
  emailVerified: boolean | null;
}

/**
 * The signed-in customer for a restaurant, or null when the session belongs elsewhere — straight from
 * the verified session token, with NO database read. This ran `getCustomerById` (a full transaction,
 * ~1.3 s on the hosted pooler) several times per signed-in page view; the token is HS256-signed by
 * this server, so its claims are already proof of who signed in. Anything that acts on the account
 * reads the row itself (RLS-scoped by `customerId`); placing an order locks and re-checks it
 * (`createOrder`). A deleted account keeps a working header until the cookie expires or they sign out,
 * but can do nothing with it. `userId` is `customer.id` (0021: the login is the `customers` row).
 */
export function resolveCustomer(session: CustomerSessionPayload, restaurantId: string): StorefrontCustomer | null {
  if (session.restaurantId !== restaurantId) return null;
  return {
    customerId: session.customerId,
    name: session.name,
    userId: session.customerId,
    emailVerified: typeof session.emailVerified === "boolean" ? session.emailVerified : null,
  };
}

export function requestContextFrom(actor: StaffActor | null, extra: Partial<RequestContext> = {}): RequestContext {
  return {
    userId: actor?.userId ?? null,
    restaurantId: actor?.restaurantId ?? null,
    actor: actor?.name ?? null,
    ...extra,
  };
}
