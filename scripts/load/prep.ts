/**
 * Load-test fixtures — LOCAL database only (refuses anything that is not localhost/127.0.0.1).
 *   - N verified test customers per restaurant (email lt-<slug>-<i>@loadtest.example) + a signed session cookie each
 *   - cart (tray) cookies built with the app's own codec
 *   - a staff session for each restaurant's owner (admin traffic)
 *   - every branch of the listed restaurants set to open around the clock, so a run never depends on the time of day
 *
 *   LOADTEST_DB_URL=postgresql://app_owner:app_owner@localhost:54329/restaurant_platform_test \
 *   LOADTEST_AUTH_SECRET=<the AUTH_SECRET the test servers run with> \
 *   npx tsx scripts/load/prep.ts            → scripts/load/.out/fixtures.json
 * See SKILL.md §28 for the whole procedure.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { SignJWT } from "jose";
import { encodeTray, trayCookieName, type Tray } from "../../src/shared/tray";

const DB = process.env.LOADTEST_DB_URL ?? "";
const host = (() => {
  try {
    return new URL(DB).hostname;
  } catch {
    return "";
  }
})();
if (host !== "localhost" && host !== "127.0.0.1") {
  throw new Error("LOADTEST_DB_URL must point at a local throwaway database (localhost) — never a shared or hosted one");
}
const SECRET = new TextEncoder().encode(process.env.LOADTEST_AUTH_SECRET ?? "loadtest-secret-0123456789abcdef");
const OUT = path.resolve("scripts/load/.out/fixtures.json");

const RESTAURANTS = [
  { slug: "bella-napoli", customers: 1100, items: ["Spaghetti Bolognese", "Lasagna al Forno", "Penne Arrabbiata"], area: "Gulberg", city: "Lahore", phoneBase: 3_400_000_000 },
  { slug: "zaytoun", customers: 400, items: ["Chicken Maqluba", "Lamb Yakhni", "Chicken Shawarma Plate"], area: "F-7", city: "Islamabad", phoneBase: 3_410_000_000 },
];

const sign = (payload: Record<string, unknown>, ttlSeconds: number) =>
  new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("restaurant-platform")
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)
    .sign(SECRET);

const client = new pg.Client({ connectionString: DB });
await client.connect();
const out: Record<string, unknown> = {};
const allDay = JSON.stringify(Object.fromEntries(["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((day) => [day, [{ open: "00:00", close: "00:00" }]])));

for (const spec of RESTAURANTS) {
  const restaurant = (await client.query("select id from restaurants where slug = $1", [spec.slug])).rows[0];
  if (!restaurant) throw new Error(`${spec.slug} is not seeded (npm run db:seed / db:seed:${spec.slug})`);
  const restaurantId: string = restaurant.id;
  await client.query("update restaurant1s set hours = $1::jsonb where restaurant_id = $2", [allDay, restaurantId]);
  const branches = (await client.query("select id from restaurant1s where restaurant_id = $1 and is_active order by is_primary desc, sort_order, name", [restaurantId])).rows;
  const items = (await client.query(
    "select id, slug from menu_items where restaurant_id = $1 and name = any($2) and is_active and is_available",
    [restaurantId, spec.items],
  )).rows;
  if (items.length !== spec.items.length) throw new Error(`${spec.slug}: menu items missing`);

  await client.query("delete from customers where restaurant_id = $1 and email like 'lt-%@loadtest.example'", [restaurantId]);
  const values: string[] = [];
  const params: unknown[] = [restaurantId];
  for (let i = 0; i < spec.customers; i++) {
    params.push(`lt-${spec.slug}-${i}@loadtest.example`, `+92${spec.phoneBase + i}`);
    values.push(`($1, 'Load Tester ${i}', $${params.length - 1}, $${params.length}, false, true, 'x', 'password')`);
  }
  const rows = (await client.query(
    `insert into customers (restaurant_id, full_name, email, phone, is_guest, is_email_verified, password_hash, auth_provider)
     values ${values.join(",")} returning id, full_name, email, phone`,
    params,
  )).rows;
  const customers = [];
  for (const row of rows) {
    customers.push({
      id: row.id,
      name: row.full_name,
      email: row.email,
      phone: row.phone,
      session: await sign({ sub: row.id, customerId: row.id, restaurantId, name: row.full_name, emailVerified: true }, 60 * 60 * 24),
    });
  }

  const tray = (orderType: "pickup" | "delivery", index: number): string => {
    const t: Tray = { orderType, locationId: branches[0].id, couponCode: null, lines: [{ menuItemId: items[index % items.length].id, variantId: null, quantity: 2, addons: [] }] };
    return encodeTray(t);
  };
  const owner = (await client.query(
    "select user_id, email, full_name from team_members where restaurant_id = $1 and role = 'owner' and is_active order by created_at limit 1",
    [restaurantId],
  )).rows[0];

  out[spec.slug] = {
    restaurantId,
    branchId: branches[0].id,
    trayCookie: trayCookieName(spec.slug),
    trays: { pickup: [0, 1, 2].map((i) => tray("pickup", i)), delivery: [0, 1, 2].map((i) => tray("delivery", i)) },
    itemSlugs: items.map((item) => item.slug),
    address: { addressLine1: "House 12, Street 4", area: spec.area, city: spec.city },
    customers,
    staffSession: await sign({ sub: owner.user_id, email: owner.email, name: owner.full_name, restaurantId, role: "owner" }, 60 * 60 * 12),
  };
  console.log(`${spec.slug}: ${customers.length} customers, items ${spec.items.join(", ")}`);
}

mkdirSync(path.dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out));
await client.end();
console.log("wrote", OUT);
