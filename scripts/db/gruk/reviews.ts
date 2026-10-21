/**
 * OPTIONAL sample reviews for the GRUK DEMO tenant. Additive and reversible: it never touches anything but rows in
 * `reviews` for the `gruk` restaurant, and it never re-seeds the tenant (so your DB / super-admin settings stay).
 *
 *   npx tsx scripts/db/gruk/reviews.ts            install (re-running replaces its own 10 rows, no duplicates)
 *   npx tsx scripts/db/gruk/reviews.ts --remove   delete exactly those rows again
 *
 * These are WRITTEN SAMPLES, not real customers: they exist so the demo shows how the reviews section looks.
 * Do not present them to GRUK as genuine feedback, and delete them (--remove) before the site goes live.
 * Reviews only show on the site when the reviews feature is on (restaurants.features.reviews) and a page has a
 * reviews section; this script does not change either.
 */
import pg from "pg";
import { loadEnv } from "../env";

const SLUG = "gruk";

/** author, item (menu slug, or null for the restaurant in general), rating, title, comment, days ago, featured */
const REVIEWS: [string, string | null, number, string, string, number, boolean][] = [
  ["Ali R.", "solid-smash", 5, "Proper smash burger", "Thin crispy-edged patties, melted cheese and onions that actually taste caramelised. Simple and done right.", 2, true],
  ["Hira S.", "the-pepper-melt", 5, "The Pepper Melt is the one", "Peppery, cheesy and messy in the best way. Arrived hot and nothing was soggy.", 4, true],
  ["Usman T.", "pookie-bird", 5, "Crispy and juicy", "The chicken stayed crunchy all the way home and the sauce had a real kick. Ordering again this week.", 5, true],
  ["Sara M.", "shroom-e-alaa", 4, "Mushroom lovers, go", "The creamy mushroom sauce is the star. Rich, so I would share the fries with it.", 7, false],
  ["Hamza I.", "doomsday", 5, "Actually spicy", "Not fake spicy. Jawbreaker was good but Doomsday had me reaching for the Pepsi. Worth it.", 9, true],
  ["Zainab K.", "fire-and-velvet", 5, "Tenders done right", "Crispy outside, tender inside, and the fiery and smooth mix works. Get a dip, or three.", 11, false],
  ["Bilal A.", "bravas-potatoes", 4, "Bravas with a kick", "Crispy potatoes with a proper sauce. Big portion for the price, good for sharing.", 14, false],
  ["Maryam F.", "jawbreaker", 5, "Crunch you can hear", "The fried chicken burger is huge and crunchy, and the bun holds together. Delivery was quick too.", 16, true],
  ["Daniyal Q.", null, 5, "Highkey worth it", "Short menu, but everything on it is good. Easy online ordering and it arrived across Cantt in about 35 minutes.", 19, false],
  ["Noor E.", "glaze-and-daze", 4, "Sticky and sweet", "The glazed tenders are sweet with a bit of heat. Add the Gruk'd Secret dip and you are set.", 23, false],
];

loadEnv();
const connectionString = process.env.DATABASE_URL_MIGRATOR ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL_MIGRATOR is required");

const client = new pg.Client({ connectionString });
await client.connect();
try {
  const restaurant = (await client.query<{ id: string }>("select id from restaurants where slug = $1", [SLUG])).rows[0];
  if (!restaurant) throw new Error(`restaurant "${SLUG}" not found: run the GRUK seed first`);

  await client.query("begin");
  // idempotent: remove this script's own rows (same author + title) before inserting them again
  const removed = await client.query(
    "delete from reviews where restaurant_id = $1 and (author_name, title) in (select a, t from unnest($2::text[], $3::text[]) as x(a, t))",
    [restaurant.id, REVIEWS.map((r) => r[0]), REVIEWS.map((r) => r[3])],
  );

  if (process.argv.includes("--remove")) {
    await client.query("commit");
    console.log(`removed ${removed.rowCount} sample review(s)`);
  } else {
    const items = (await client.query<{ id: string; slug: string }>("select id, slug from menu_items where restaurant_id = $1", [restaurant.id])).rows;
    const itemId = new Map(items.map((item) => [item.slug, item.id]));
    for (const [author, slug, rating, title, comment, daysAgo, featured] of REVIEWS) {
      if (slug && !itemId.has(slug)) console.warn(`  menu item "${slug}" not found, saving that review without a dish`);
      await client.query(
        `insert into reviews (restaurant_id, customer_id, menu_item_id, author_name, rating, title, comment, status, is_featured, created_at)
         values ($1, null, $2, $3, $4, $5, $6, 'approved'::review_status, $7, now() - ($8 || ' days')::interval)`,
        [restaurant.id, slug ? (itemId.get(slug) ?? null) : null, author, rating, title, comment, featured, String(daysAgo)],
      );
    }
    await client.query("commit");
    console.log(`installed ${REVIEWS.length} sample reviews (replaced ${removed.rowCount} earlier)`);
  }
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
