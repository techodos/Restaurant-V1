/**
 * Creates a staff login, or resets the password of an existing one.
 *
 *   npm run db:create-staff -- --email owner2@bellanapoli.pk --name "Jane Doe" \
 *     --role manager --password "SomePass#1" [--restaurant bella-napoli]
 *
 * Runs as DATABASE_URL_MIGRATOR (owner), which is required: the runtime roles
 * (app_service/app_runtime) cannot write auth.users on a hosted Supabase project
 * (docs/skills/restaurant-platform/SKILL.md §6/§16) — this script bypasses that
 * by never running through the app.
 *
 * role must be one of: owner, admin, manager, staff.
 */
import pg from "pg";
import { loadEnv } from "./env";
import { hashPassword } from "../../src/server/auth/password";

loadEnv();

const ROLES = ["owner", "admin", "manager", "staff"];

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const email = arg("email")?.trim().toLowerCase();
const name = arg("name")?.trim();
const role = arg("role")?.trim();
const password = arg("password");
const restaurantSlug = arg("restaurant") ?? "bella-napoli";

if (!email || !name || !role || !password) {
  console.error("Usage: npm run db:create-staff -- --email <email> --name <name> --role <owner|admin|manager|staff> --password <password> [--restaurant <slug>]");
  process.exit(1);
}
if (!ROLES.includes(role)) {
  console.error(`--role must be one of: ${ROLES.join(", ")}`);
  process.exit(1);
}
if (password.length < 8) {
  console.error("--password must be at least 8 characters");
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

const hashed = await hashPassword(password);

const existingUser = await one<{ id: string }>(`select id from auth.users where lower(email) = $1`, [email]);
let userId = existingUser?.id ?? null;

if (!userId) {
  const inserted = await one<{ id: string }>(
    `insert into auth.users (email, encrypted_password, raw_user_meta_data)
     values ($1, $2, jsonb_build_object('name', $3::text))
     returning id`,
    [email, hashed, name],
  );
  userId = inserted?.id ?? null;
} else {
  await client.query(`update auth.users set encrypted_password = $2 where id = $1`, [userId, hashed]);
}
if (!userId) throw new Error("Unable to create the auth user");

await client.query(
  `insert into team_members (restaurant_id, user_id, email, full_name, role, is_active, accepted_at)
   values ($1, $2, $3, $4, $5::team_role, true, now())
   on conflict (restaurant_id, email) do update set
     user_id = excluded.user_id, full_name = excluded.full_name, role = excluded.role, is_active = true`,
  [restaurant.id, userId, email, name, role],
);

console.log(`Staff account ready: ${email} / ${password} (${role}) on ${restaurantSlug}`);
await client.end();
