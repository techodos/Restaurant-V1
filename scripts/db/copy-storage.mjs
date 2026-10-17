#!/usr/bin/env node
/**
 * Copy the Supabase Storage bucket (SUPABASE_STORAGE_BUCKET) from one project to another, then rewrite the
 * old project's URL to the new one in every text/jsonb column of the target database.
 *   npm run db:copy-storage              copy files + rewrite URLs
 *   npm run db:copy-storage -- --no-rewrite   files only
 * Source = NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 * Target = SUPABASE_URL_TARGET + SUPABASE_SERVICE_ROLE_KEY_TARGET (+ DATABASE_URL_TARGET for the rewrite).
 * Safe to re-run: uploads use upsert, the rewrite is a no-op once the old URL is gone. The source is only read.
 */
import pg from "pg";

const env = (k) => {
  const v = process.env[k]?.trim();
  if (!v) throw new Error(`${k} is required`);
  return v.replace(/\/+$/, "");
};
const src = { url: env("NEXT_PUBLIC_SUPABASE_URL"), key: env("SUPABASE_SERVICE_ROLE_KEY") };
const dst = { url: env("SUPABASE_URL_TARGET"), key: env("SUPABASE_SERVICE_ROLE_KEY_TARGET") };
const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || "restaurant-media";
if (src.url === dst.url) throw new Error("source and target are the same project");

const api = (p, path, init = {}) =>
  fetch(`${p.url}/storage/v1/${path}`, {
    ...init,
    headers: { apikey: p.key, Authorization: `Bearer ${p.key}`, ...init.headers },
  });
const json = async (res, what) => {
  if (!res.ok) throw new Error(`${what} failed (${res.status}): ${await res.text()}`);
  return res.json();
};

// ensure the target bucket exists with the source's visibility and limits
const srcBucket = await json(await api(src, `bucket/${bucket}`), "read source bucket");
const probe = await api(dst, `bucket/${bucket}`);
if (probe.status === 404 || probe.status === 400) {
  await json(
    await api(dst, "bucket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: bucket,
        name: bucket,
        public: srcBucket.public,
        file_size_limit: srcBucket.file_size_limit,
        allowed_mime_types: srcBucket.allowed_mime_types,
      }),
    }),
    "create target bucket",
  );
  console.log(`• created target bucket ${bucket} (public: ${srcBucket.public})`);
} else if (!probe.ok) {
  throw new Error(`read target bucket failed (${probe.status}): ${await probe.text()}`);
}

// list every object (folders come back with id === null)
async function list(prefix = "") {
  const out = [];
  for (let offset = 0; ; offset += 100) {
    const items = await json(
      await api(src, `object/list/${bucket}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix, limit: 100, offset, sortBy: { column: "name", order: "asc" } }),
      }),
      `list ${prefix || "/"}`,
    );
    for (const it of items) {
      const full = prefix ? `${prefix}/${it.name}` : it.name;
      if (it.id === null) out.push(...(await list(full)));
      else out.push({ path: full, type: it.metadata?.mimetype });
    }
    if (items.length < 100) return out;
  }
}
const files = await list();
console.log(`• ${files.length} file(s) in source bucket ${bucket}`);

const enc = (p) => p.split("/").map(encodeURIComponent).join("/");
let ok = 0;
const failed = [];
for (const f of files) {
  try {
    const get = await api(src, `object/${bucket}/${enc(f.path)}`);
    if (!get.ok) throw new Error(`download ${get.status}`);
    const body = Buffer.from(await get.arrayBuffer());
    const type = f.type || get.headers.get("content-type") || "application/octet-stream";
    const put = await api(dst, `object/${bucket}/${enc(f.path)}`, {
      method: "POST",
      headers: { "Content-Type": type, "x-upsert": "true" },
      body,
    });
    if (!put.ok) throw new Error(`upload ${put.status} ${await put.text()}`);
    ok++;
    console.log(`  ✓ ${f.path} (${body.length} B)`);
  } catch (e) {
    failed.push(f.path);
    console.error(`  ✗ ${f.path}: ${e.message}`);
  }
}
console.log(`• copied ${ok}/${files.length}`);

if (process.argv.includes("--no-rewrite")) process.exit(failed.length ? 1 : 0);
if (failed.length) {
  console.error("✗ some files failed; URLs NOT rewritten (fix and re-run)");
  process.exit(1);
}

// rewrite old project URL -> new one across the target DB
const db = new pg.Client({ connectionString: env("DATABASE_URL_TARGET"), connectionTimeoutMillis: 15000 });
await db.connect();
try {
  await db.query("begin");
  await db.query("set local session_replication_role = replica"); // no updated_at/notification triggers
  const cols = (
    await db.query(
      `select c.table_name, c.column_name, c.data_type
         from information_schema.columns c
         join information_schema.tables t using (table_schema, table_name)
        where c.table_schema = 'public' and t.table_type = 'BASE TABLE' and c.table_name <> 'schema_migrations'
          and c.data_type in ('text', 'character varying', 'jsonb')`,
    )
  ).rows;
  let total = 0;
  for (const { table_name: t, column_name: col, data_type } of cols) {
    const jsonb = data_type === "jsonb";
    const expr = jsonb ? `replace("${col}"::text, $1, $2)::jsonb` : `replace("${col}", $1, $2)`;
    const r = await db.query(
      `update public."${t}" set "${col}" = ${expr} where "${col}"::text like '%' || $1 || '%'`,
      [src.url, dst.url],
    );
    if (r.rowCount) {
      total += r.rowCount;
      console.log(`  ↻ ${t}.${col}: ${r.rowCount} row(s)`);
    }
  }
  await db.query("commit");
  console.log(`✓ rewrote URLs in ${total} row(s)`);
} catch (e) {
  await db.query("rollback").catch(() => {});
  console.error(`✗ rewrite rolled back: ${e.message}`);
  process.exitCode = 1;
} finally {
  await db.end();
}
