import { createHash } from 'node:crypto';
import { errors } from '@/server/errors';
import { checkRateLimit } from '@/server/rate-limit';
import { can, effectivePermissions, isSuperAdmin, type Permission } from './permissions';
import type { TeamRole } from '@/shared/contract/enums';
import type { RequestContext } from '@/server/context';
import { getDb } from '@/server/db/registry';
import { mapTeamMember, str, type Row } from '@/server/db/mappers';
import { getRestaurantBySlug } from '@/server/repositories/restaurants';
import { ttlCache } from '@/server/cache/ttl';
import { hashPassword, verifyPassword } from './password';
import {
  SESSION_TTL,
  signCustomerSession,
  signStaffSession,
  type CustomerSessionPayload,
  type StaffSessionPayload,
} from './tokens';
import type { Restaurant, TeamMember } from '@/shared/contract/models';

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
  /** The restaurant the session belongs to; its admin lives at /r/<restaurantSlug>/admin. */
  restaurantSlug: string;
  role: TeamRole;
  member: TeamMember;
  permissions: Permission[];
}

/** Staff lookups cached per process for page views (see `authenticateStaff`). */
const STAFF_CACHE_TTL_MS = 30_000;
const staffActors = ttlCache<StaffActor | null>("staff-actors", STAFF_CACHE_TTL_MS);

/** Drops every cached staff lookup — call after any team-member write (role, active flag, removal). */
export function invalidateStaffActors(): void {
  staffActors.clear();
}

/**
 * Resolves the staff member behind a session. `restaurantSlug` narrows the
 * session to a specific tenant so an admin can never operate outside their
 * restaurants.
 *
 * Every admin page, route and action calls this, so it is ONE statement (membership + the restaurant it
 * is checked against; it used to be two in a transaction) and, unless `fresh`, cached per process for
 * `STAFF_CACHE_TTL_MS`. Callers pass `fresh: true` for writes (server actions): a deactivated member or
 * a changed role is then refused at once; page views may lag up to the TTL on another instance (team
 * writes clear this instance's cache — `invalidateStaffActors`).
 */
export async function authenticateStaff(
  session: StaffSessionPayload,
  restaurantSlug?: string,
  options: { fresh?: boolean } = {},
): Promise<StaffActor | null> {
  const key = `${session.sub}|${session.restaurantId}|${restaurantSlug ?? ""}`;
  if (!options.fresh) return staffActors.get(key, () => loadStaffActor(session, restaurantSlug));
  const actor = await loadStaffActor(session, restaurantSlug);
  staffActors.set(key, actor);
  return actor;
}

async function loadStaffActor(session: StaffSessionPayload, restaurantSlug?: string): Promise<StaffActor | null> {
  const row = await getDb({ restaurantId: session.restaurantId }).queryOne<Row>(
    { userId: session.sub, restaurantId: session.restaurantId },
    // the membership the session was issued for (one login may belong to several restaurants), and the
    // restaurant it is checked against: the one named in the URL, else the member's own
    `select tm.*, r.id as checked_restaurant_id, r.slug as checked_restaurant_slug
       from team_members tm
       left join restaurants r on (case when $3::text is null then r.id = tm.restaurant_id else r.slug = $3::text end)
      where tm.user_id = $1 and tm.restaurant_id = $2 and tm.is_active
      order by tm.created_at
      limit 1`,
    [session.sub, session.restaurantId, restaurantSlug ?? null],
  );
  if (!row || !row.checked_restaurant_id) return null;
  const home = mapTeamMember(row);
  const restaurant = { id: str(row.checked_restaurant_id), slug: str(row.checked_restaurant_slug) };
  // A super admin's row lives in one "home" restaurant but acts in any; everyone else may not act on a
  // restaurant they do not belong to.
  if (restaurant.id !== home.restaurantId && !isSuperAdmin(home.role)) return null;
  const member = actingMember(home, restaurant.id);

  return {
    userId: session.sub,
    email: member.email,
    name: member.fullName,
    restaurantId: member.restaurantId,
    restaurantSlug: restaurant.slug,
    role: member.role,
    member,
    permissions: effectivePermissions(member.role, member.permissions),
  };
}

/** A super admin's home membership as the member of `restaurantId`: same login, restaurant-wide. */
export function actingMember(member: TeamMember, restaurantId: string): TeamMember {
  return isSuperAdmin(member.role) && member.restaurantId !== restaurantId
    ? { ...member, restaurantId, locationId: null }
    : member;
}

/** Server-side authorisation: hiding UI is never enough. */
export function assertPermission(
  actor: StaffActor,
  permission: Permission,
): void {
  if (
    !can(
      { role: actor.role, permissions: actor.member.permissions },
      permission,
    )
  ) {
    throw errors.forbidden(
      `Your role (${actor.role}) cannot perform this action.`,
    );
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
  identifier = 'unknown',
): Promise<SignInResult> {
  checkRateLimit({
    key: 'staff-signin',
    identifier,
    limit: 8,
    windowMs: 5 * 60_000,
  });
  // per account too: the caller key is an IP, so one account guessed from many addresses was never limited
  checkRateLimit({
    key: 'staff-signin-account',
    identifier: email.trim().toLowerCase(),
    limit: 10,
    windowMs: 15 * 60_000,
  });

  const restaurant = await getRestaurantBySlug(restaurantSlug);
  if (!restaurant) throw errors.unauthorized('Invalid email or password.');

  const db = getDb({ restaurantId: restaurant.id });
  const row = await db.write({}, async (tx) => {
    const sql = `select tm.*, u.encrypted_password, u.id as auth_user_id
         from team_members tm
         left join auth.users u on u.id = tm.user_id
        where lower(tm.email) = lower($2) and tm.is_active and `;
    // the restaurant's own member first; failing that a super admin (one row, any restaurant) signing in here
    return (
      (await tx.queryOne<Row>(`${sql} tm.restaurant_id = $1`, [restaurant.id, email.trim()])) ??
      (await tx.queryOne<Row>(`${sql} tm.role = 'super_admin' order by tm.created_at limit 1`, [restaurant.id, email.trim()]))
    );
  });

  const passwordOk = await verifyPassword(
    password,
    row?.encrypted_password ? str(row.encrypted_password) : null,
  );
  if (!row || !passwordOk) {
    throw errors.unauthorized('Invalid email or password.');
  }

  const home = mapTeamMember(row);
  if (!home.userId)
    throw errors.unauthorized(
      'This staff account is not linked to a login yet.',
    );
  const member = actingMember(home, restaurant.id);

  // auth.users is Supabase's own protected schema on a hosted project (DECISIONS.md §2:
  // "NEVER attempt to modify the Supabase auth schema") — app_service cannot write to it there,
  // so last-login bookkeeping lives on team_members only.
  await db.write(
    { userId: member.userId, restaurantId: restaurant.id },
    async (tx) => {
      await tx.query(
        `update team_members set last_login_at = now() where id = $1`,
        [home.id],
      );
    },
  );

  const token = await signStaffSession({
    sub: home.userId,
    email: member.email,
    name: member.fullName,
    // the token stays anchored to the member's own (home) restaurant; authenticateStaff widens it for a super admin
    restaurantId: home.restaurantId,
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
 * state) plus the password (bcrypt) check. The restaurant comes from the caller (the storefront snapshot), not a
 * second lookup, and the verification state travels in the session token so the pages that follow
 * never have to ask the database who is signed in.
 */
export async function signInCustomer(
  email: string,
  password: string,
  restaurant: Pick<Restaurant, 'id'>,
  identifier = 'unknown',
): Promise<CustomerSignInResult> {
  // Per caller (IP): generous, because mobile carriers put many customers behind one address (CGNAT); the
  // per-account limit below is what stops guessing one account's password.
  checkRateLimit({
    key: 'customer-signin',
    identifier,
    limit: 30,
    windowMs: 5 * 60_000,
  });
  checkRateLimit({
    key: 'customer-signin-account',
    identifier: `${restaurant.id}:${email.trim().toLowerCase()}`,
    limit: 10,
    windowMs: 15 * 60_000,
  });

  const row = await getDb({ restaurantId: restaurant.id }).write(
    {},
    async (tx) =>
      tx.queryOne<Row>(
        `select id, password_hash, full_name, is_email_verified from customers
        where restaurant_id = $1 and lower(email) = lower($2) and not is_guest`,
        [restaurant.id, email.trim()],
      ),
  );

  const passwordOk = await verifyPassword(
    password,
    row?.password_hash ? str(row.password_hash) : null,
  );
  if (!row || !passwordOk)
    throw errors.unauthorized('Invalid email or password.');

  const emailVerified = Boolean(row.is_email_verified);
  const token = await signCustomerSession({
    sub: str(row.id),
    customerId: str(row.id),
    restaurantId: restaurant.id,
    name: str(row.full_name),
    emailVerified,
  });
  return {
    token,
    maxAge: SESSION_TTL.customer,
    customerId: str(row.id),
    emailVerified,
  };
}

// ── Forgot password ──────────────────────────────────────────────────────────

/** Short, non-reversible stand-in for the current password hash, carried by the reset token (see tokens.ts). */
export function passwordFingerprint(passwordHash: string | null): string {
  return createHash('sha256')
    .update(passwordHash ?? '')
    .digest('hex')
    .slice(0, 32);
}

/** The account a reset code would be sent for: ONE read by email, same privileged lookup as sign-in. */
export async function findPasswordResetAccount(
  restaurant: Pick<Restaurant, 'id'>,
  email: string,
): Promise<{
  customerId: string;
  email: string;
  passwordFingerprint: string;
} | null> {
  const row = await getDb({ restaurantId: restaurant.id }).write(
    {},
    async (tx) =>
      tx.queryOne<Row>(
        `select id, email, password_hash from customers
        where restaurant_id = $1 and lower(email) = lower($2) and not is_guest`,
        [restaurant.id, email.trim()],
      ),
  );
  if (!row) return null;
  return {
    customerId: str(row.id),
    email: str(row.email),
    passwordFingerprint: passwordFingerprint(
      row.password_hash ? str(row.password_hash) : null,
    ),
  };
}

/**
 * Sets the new password and signs the customer in, in one transaction. The row is locked and its current
 * hash must still match the fingerprint the reset token was issued for, so a token works exactly once
 * (and not at all after any other password change). The code they entered proved they own the inbox,
 * so the email is marked verified too.
 */
export async function resetCustomerPassword(
  grant: {
    customerId: string;
    restaurantId: string;
    passwordFingerprint: string;
  },
  newPassword: string,
): Promise<CustomerSignInResult> {
  const hashed = await hashPassword(newPassword);
  const row = await getDb({ restaurantId: grant.restaurantId }).write(
    {},
    async (tx) => {
      const current = await tx.queryOne<Row>(
        `select password_hash from customers where id = $1 and restaurant_id = $2 and not is_guest for update`,
        [grant.customerId, grant.restaurantId],
      );
      if (
        !current ||
        passwordFingerprint(
          current.password_hash ? str(current.password_hash) : null,
        ) !== grant.passwordFingerprint
      ) {
        return null;
      }
      return tx.queryOne<Row>(
        `update customers set password_hash = $3, is_email_verified = true, updated_at = now()
        where id = $1 and restaurant_id = $2
        returning id, full_name`,
        [grant.customerId, grant.restaurantId, hashed],
      );
    },
  );
  if (!row)
    throw errors.validation(
      'This reset link has already been used or has expired. Please start again.',
    );

  const token = await signCustomerSession({
    sub: str(row.id),
    customerId: str(row.id),
    restaurantId: grant.restaurantId,
    name: str(row.full_name),
    emailVerified: true,
  });
  return {
    token,
    maxAge: SESSION_TTL.customer,
    customerId: str(row.id),
    emailVerified: true,
  };
}

export const PHONE_TAKEN_MESSAGE = 'An account with that phone number already exists. Please sign in instead.';

/** Guest accounts can be upgraded to a real login without losing history. */
export async function createCustomerAccount(
  input: {
    restaurant: Pick<Restaurant, 'id'>;
    fullName: string;
    email: string;
    phone: string;
    password: string;
  },
  identifier = 'unknown',
): Promise<CustomerSignInResult> {
  checkRateLimit({
    key: 'customer-signup',
    identifier,
    limit: 5,
    windowMs: 15 * 60_000,
  });

  const { restaurant } = input;
  const hashed = await hashPassword(input.password);

  const customerId = await getDb({ restaurantId: restaurant.id }).write(
    { restaurantId: restaurant.id },
    async (tx) => {
      const existing = await tx.queryOne<Row>(
        `select id from customers where restaurant_id = $1 and lower(email) = lower($2) and not is_guest`,
        [restaurant.id, input.email.trim()],
      );
      if (existing)
        throw errors.conflict('An account with that email already exists.');

      // A phone number is never verified, so a same-phone row is only taken over when it is a GUEST row with no
      // email or this same email (a guest upgrading). Anyone else's account comes back as no row: refused.
      const row = await tx.queryOne<Row>(
        `insert into customers (restaurant_id, full_name, email, phone, password_hash, is_guest)
       values ($1,$2,$3,$4,$5,false)
       on conflict (restaurant_id, phone) do update set
         full_name = excluded.full_name, email = excluded.email, password_hash = excluded.password_hash, is_guest = false
       where customers.is_guest and (customers.email is null or lower(customers.email) = lower(excluded.email))
       returning id`,
        [
          restaurant.id,
          input.fullName,
          input.email.trim().toLowerCase(),
          input.phone.trim(),
          hashed,
        ],
      );
      if (!row) throw errors.conflict(PHONE_TAKEN_MESSAGE);
      return str(row.id);
    },
  );

  const token = await signCustomerSession({
    sub: customerId,
    customerId,
    restaurantId: restaurant.id,
    name: input.fullName,
    emailVerified: false,
  });
  return {
    token,
    maxAge: SESSION_TTL.customer,
    customerId,
    emailVerified: false,
  };
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
export function resolveCustomer(
  session: CustomerSessionPayload,
  restaurantId: string,
): StorefrontCustomer | null {
  if (session.restaurantId !== restaurantId) return null;
  return {
    customerId: session.customerId,
    name: session.name,
    userId: session.customerId,
    emailVerified:
      typeof session.emailVerified === 'boolean' ? session.emailVerified : null,
  };
}

export function requestContextFrom(
  actor: StaffActor | null,
  extra: Partial<RequestContext> = {},
): RequestContext {
  return {
    userId: actor?.userId ?? null,
    restaurantId: actor?.restaurantId ?? null,
    actor: actor?.name ?? null,
    ...extra,
  };
}
