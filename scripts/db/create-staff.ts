/**
 * Creates a staff login, or resets the password of an existing one.
 *
 *   npm run db:create-staff -- --email owner2@bellanapoli.pk --name "Jane Doe" \
 *     --role manager --password "SomePass#1" [--restaurant bella-napoli] [--location <branch-slug>]
 *
 * --location scopes this staff member to one branch: RLS then limits their orders/reservations
 * (and everything keyed off an order, e.g. payments/deliveries/status history) to that branch only.
 * Omit it for HQ staff (owner/admin) who should see every branch.
 *
 * Runs as DATABASE_URL_MIGRATOR (owner), which is required: the runtime roles
 * (app_service/app_runtime) cannot write auth.users on a hosted Supabase project
 * (docs/skills/restaurant-platform/SKILL.md §6/§16) — this script bypasses that
 * by never running through the app.
 *
 * role must be one of: super_admin, owner, admin, manager, staff.
 * super_admin is platform-wide (every restaurant's admin + /super-admin); its row lives in --restaurant, so keep that
 * restaurant stable (deleting it deletes the login).
 */
import pg from "pg";
import { loadEnv } from "./env";
import { fitsPasswordLimit, hashPassword } from "../../src/server/auth/password";

loadEnv();

const ROLES = ["super_admin", "owner", "admin", "manager", "staff"];

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const email = arg("email")?.trim().toLowerCase();
const name = arg("name")?.trim();
const role = arg("role")?.trim();
const password = arg("password");
const restaurantSlug = arg("restaurant") ?? "bella-napoli";
const locationSlug = arg("location");

if (!email || !name || !role || !password) {
  console.error("Usage: npm run db:create-staff -- --email <email> --name <name> --role <super_admin|owner|admin|manager|staff> --password <password> [--restaurant <slug>]");
  process.exit(1);
}
if (!ROLES.includes(role)) {
  console.error(`--role must be one of: ${ROLES.join(", ")}`);
  process.exit(1);
}
if (password.length < 8 || !fitsPasswordLimit(password)) {
  console.error("--password must be 8 to 72 characters");
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL_MIGRATOR ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL_MIGRATOR is required");

const client = new pg.Client({ connectionString });
await client.connect();

async function one<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []): Promise<T | null> {
  const result = await client.query<T>(text, params);
  return result.rows[0] ?? null;
}

const restaurant = await one<{ id: string }>(`select id from restaurants where slug = $1`, [restaurantSlug]);
if (!restaurant) {
  console.error(`No restaurant with slug "${restaurantSlug}"`);
  await client.end();
  process.exit(1);
}

let locationId: string | null = null;
if (locationSlug) {
  const location = await one<{ id: string }>(
    `select id from restaurant1s where restaurant_id = $1 and slug = $2`,
    [restaurant.id, locationSlug],
  );
  if (!location) {
    console.error(`No location with slug "${locationSlug}" on ${restaurantSlug}`);
    await client.end();
    process.exit(1);
  }
  locationId = location.id;
}

const hashed = await hashPassword(password);

const existingUser = await one<{ id: string }>(`select id from auth.users where lower(email) = $1`, [email]);
let userId = existingUser?.id ?? null;

if (!userId) {
  // auth.users.id has no column default on this database (found 2026-09-22, see
  // db/migrations/0021's header) — generate it explicitly rather than relying on one.
  const inserted = await one<{ id: string }>(
    `insert into auth.users (id, email, encrypted_password, raw_user_meta_data)
     values (gen_random_uuid(), $1, $2, jsonb_build_object('name', $3::text))
     returning id`,
    [email, hashed, name],
  );
  userId = inserted?.id ?? null;
} else {
  await client.query(`update auth.users set encrypted_password = $2 where id = $1`, [userId, hashed]);
}
if (!userId) throw new Error("Unable to create the auth user");

await client.query(
  `insert into team_members (restaurant_id, user_id, location_id, email, full_name, role, is_active, accepted_at)
   values ($1, $2, $3, $4, $5, $6::team_role, true, now())
   on conflict (restaurant_id, email) do update set
     user_id = excluded.user_id, location_id = excluded.location_id, full_name = excluded.full_name,
     role = excluded.role, is_active = true`,
  [restaurant.id, userId, locationId, email, name, role],
);

console.log(
  `Staff account ready: ${email} / ${password} (${role}${locationSlug ? `, branch: ${locationSlug}` : ", all branches"}) on ${restaurantSlug}, sign in at /r/${restaurantSlug}/admin/login`,
);
await client.end();
