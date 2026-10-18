/**
 * Move a restaurant's static images to Supabase Storage and repoint the database (see ./supabase-images.ts).
 *
 *   npm run db:images:supabase -- <slug> <file> [file…]
 *   npm run db:images:supabase -- blue-hour hero.jpg cover.jpg about.jpg
 *   npm run db:images:supabase -- blue-hour gallery/terrace.jpg menu/latte.jpg
 *
 * Restart (or wait for the storefront cache refresh of) a running app afterwards: the storefront serves
 * restaurant/page data from its in-memory snapshot.
 */
import pg from "pg";
import { loadEnv } from "./env";
import { migrateImagesToSupabase, supabaseStorageEnv } from "./supabase-images";

loadEnv();
const [slug, ...files] = process.argv.slice(2);
if (!slug || files.length === 0) {
  console.error("usage: npm run db:images:supabase -- <slug> <file> [file…]");
  process.exit(1);
}
const env = supabaseStorageEnv();
if (!env) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local");
  process.exit(1);
}
const connectionString = process.env.DATABASE_URL_MIGRATOR ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL_MIGRATOR is required");

const client = new pg.Client({ connectionString });
await client.connect();
try {
  console.log(`• moving ${files.length} image${files.length === 1 ? "" : "s"} of ${slug} to Supabase bucket "${env.bucket}"`);
  const results = await migrateImagesToSupabase(client, env, { slug, files });
  const untouched = results.filter((result) => result.rowsUpdated === 0);
  console.log(`\n✔ done — ${results.length} uploaded, ${results.length - untouched.length} referenced in the database`);
  if (untouched.length) {
    console.log(`  not referenced (already moved, or unused): ${untouched.map((result) => result.file).join(", ")}`);
  }
} finally {
  await client.end();
}
