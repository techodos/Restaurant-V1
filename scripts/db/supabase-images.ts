/**
 * Moves a restaurant's seeded images from the static folder (/public/images/<slug>/…) to Supabase Storage
 * and points the database at the Supabase copies. Idempotent: uploads upsert, and a URL already moved is
 * simply not found again.
 *
 *   object:   <bucket>/<slug>/<file>             e.g. restaurant-media/blue-hour/hero.jpg
 *   new URL:  <SUPABASE_URL>/storage/v1/object/public/<bucket>/<slug>/<file>
 *
 * Rewritten for that restaurant only: restaurants.logo_url / cover_url, menu_categories / menu_items
 * .image_url, media.url (+ bucket/path), and every JSON column that can carry an image URL (restaurant
 * seo/social/settings, website theme/config/seo, page sections/seo/config, location settings). JSON is
 * replaced on the quoted string ("/images/x/hero.jpg"), so hero.jpg never matches hero.jpg.bak.
 *
 * Uses the migrator connection like the seeds (never a web request). Requires NEXT_PUBLIC_SUPABASE_URL
 * and SUPABASE_SERVICE_ROLE_KEY; SUPABASE_STORAGE_BUCKET defaults to "restaurant-media" (made public,
 * as the app's own uploads already return /object/public/ URLs — services/../integrations/storage.ts).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type pg from "pg";

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
  ".avif": "image/avif", ".gif": "image/gif", ".svg": "image/svg+xml",
};

export interface SupabaseStorageEnv {
  url: string;
  serviceRoleKey: string;
  bucket: string;
}

/** null when Supabase Storage is not configured (the seeds then keep the static URLs). */
export function supabaseStorageEnv(): SupabaseStorageEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey, bucket: process.env.SUPABASE_STORAGE_BUCKET?.trim() || "restaurant-media" };
}

function headers(env: SupabaseStorageEnv, extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${env.serviceRoleKey}`, apikey: env.serviceRoleKey, ...extra };
}

/** Creates the bucket as public, or flips an existing private bucket to public. */
async function ensurePublicBucket(env: SupabaseStorageEnv): Promise<void> {
  const existing = await fetch(`${env.url}/storage/v1/bucket/${env.bucket}`, { headers: headers(env) });
  if (existing.ok) {
    const bucket = (await existing.json()) as { public?: boolean };
    if (bucket.public) return;
    const update = await fetch(`${env.url}/storage/v1/bucket/${env.bucket}`, {
      method: "PUT",
      headers: headers(env, { "Content-Type": "application/json" }),
      body: JSON.stringify({ public: true }),
    });
    if (!update.ok) throw new Error(`could not make bucket "${env.bucket}" public (${update.status}): ${await update.text()}`);
    return;
  }
  const create = await fetch(`${env.url}/storage/v1/bucket`, {
    method: "POST",
    headers: headers(env, { "Content-Type": "application/json" }),
    body: JSON.stringify({ id: env.bucket, name: env.bucket, public: true }),
  });
  if (!create.ok) throw new Error(`could not create bucket "${env.bucket}" (${create.status}): ${await create.text()}`);
}

export function publicObjectUrl(env: SupabaseStorageEnv, objectPath: string): string {
  return `${env.url}/storage/v1/object/public/${env.bucket}/${objectPath}`;
}

async function uploadFile(env: SupabaseStorageEnv, localFile: string, objectPath: string): Promise<void> {
  const contentType = MIME[path.extname(localFile).toLowerCase()];
  if (!contentType) throw new Error(`unsupported image type: ${localFile}`);
  const response = await fetch(`${env.url}/storage/v1/object/${env.bucket}/${objectPath}`, {
    method: "POST",
    headers: headers(env, { "Content-Type": contentType, "x-upsert": "true", "cache-control": "max-age=31536000" }),
    body: new Uint8Array(readFileSync(localFile)),
  });
  if (!response.ok) throw new Error(`upload of ${objectPath} failed (${response.status}): ${await response.text()}`);
}

/** table → JSON columns that may hold image URLs; every table here has restaurant_id (restaurants uses id) */
const JSON_COLUMNS: [table: string, columns: string[], key: "id" | "restaurant_id"][] = [
  ["restaurants", ["seo", "social", "settings"], "id"],
  ["websites", ["theme", "config", "seo"], "restaurant_id"],
  ["website_pages", ["sections", "seo", "config"], "restaurant_id"],
  ["restaurant1s", ["settings"], "restaurant_id"],
];

export interface MigrateImagesOptions {
  slug: string;
  /** paths relative to the restaurant's image folder, e.g. "hero.jpg", "gallery/terrace.jpg" */
  files: string[];
  /** where the originals live; defaults to scripts/db/<slug>/images, then public/images/<slug> */
  sourceDirs?: string[];
  log?: (line: string) => void;
}

export interface MigratedImage {
  file: string;
  from: string;
  to: string;
  rowsUpdated: number;
}

export async function migrateImagesToSupabase(client: pg.Client, env: SupabaseStorageEnv, options: MigrateImagesOptions): Promise<MigratedImage[]> {
  const log = options.log ?? ((line: string) => console.log(line));
  const sourceDirs = options.sourceDirs ?? [
    path.resolve("scripts", "db", options.slug, "images"),
    path.resolve("public", "images", options.slug),
  ];

  const restaurant = (await client.query<{ id: string }>(`select id from restaurants where slug = $1`, [options.slug])).rows[0];
  if (!restaurant) throw new Error(`no restaurant with slug "${options.slug}" — seed it first`);

  await ensurePublicBucket(env);

  // 1. upload everything first; the database only changes once every file is safely in storage
  const planned: { file: string; from: string; to: string; objectPath: string }[] = [];
  for (const file of options.files) {
    const clean = file.replace(/\\/g, "/").replace(/^\/+/, "");
    if (clean.includes("..")) throw new Error(`refusing path outside the image folder: ${file}`);
    const localFile = sourceDirs.map((dir) => path.join(dir, clean)).find((candidate) => existsSync(candidate));
    if (!localFile) throw new Error(`image not found: ${clean} (looked in ${sourceDirs.join(", ")})`);
    const objectPath = `${options.slug}/${clean}`;
    await uploadFile(env, localFile, objectPath);
    const to = publicObjectUrl(env, objectPath);
    log(`  ↑ ${clean} → ${to}`);
    planned.push({ file: clean, from: `/images/${options.slug}/${clean}`, to, objectPath });
  }

  // 2. repoint the database in one transaction
  const results: MigratedImage[] = [];
  await client.query("begin");
  try {
    for (const entry of planned) {
      let rows = 0;
      const run = async (sql: string, params: unknown[]) => {
        rows += (await client.query(sql, params)).rowCount ?? 0;
      };
      const id = restaurant.id;
      await run(`update restaurants set logo_url = $3 where id = $1 and logo_url = $2`, [id, entry.from, entry.to]);
      await run(`update restaurants set cover_url = $3 where id = $1 and cover_url = $2`, [id, entry.from, entry.to]);
      await run(`update menu_categories set image_url = $3 where restaurant_id = $1 and image_url = $2`, [id, entry.from, entry.to]);
      await run(`update menu_items set image_url = $3 where restaurant_id = $1 and image_url = $2`, [id, entry.from, entry.to]);
      await run(
        `update media set url = $3, bucket = $4, path = $5 where restaurant_id = $1 and url = $2`,
        [id, entry.from, entry.to, env.bucket, entry.objectPath],
      );
      const quotedFrom = JSON.stringify(entry.from);
      const quotedTo = JSON.stringify(entry.to);
      for (const [table, columns, key] of JSON_COLUMNS) {
        for (const column of columns) {
          await run(
            `update ${table} set ${column} = replace(${column}::text, $2, $3)::jsonb
              where ${key} = $1 and strpos(${column}::text, $2) > 0`,
            [id, quotedFrom, quotedTo],
          );
        }
      }
      results.push({ file: entry.file, from: entry.from, to: entry.to, rowsUpdated: rows });
      log(`  ✎ ${entry.from}: ${rows} row${rows === 1 ? "" : "s"} repointed`);
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  }
  return results;
}
