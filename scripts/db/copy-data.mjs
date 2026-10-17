#!/usr/bin/env node
/**
 * Copy all public-schema DATA from one database to another (schema must already exist on the target:
 * run `npm run db:migrate` against it first).
 *   npm run db:copy-data              copy; aborts if any target table already has rows
 *   npm run db:copy-data -- --truncate  empty the target tables first
 * Source = DATABASE_URL_MIGRATOR, target = DATABASE_URL_TARGET (use the 5432 session-mode / direct URLs).
 * Runs in ONE target transaction with session_replication_role=replica, so FK order does not matter and
 * triggers (e.g. notification enqueue) do not fire for the copied rows. Any failure rolls everything back.
 */
import pg from "pg";

const srcUrl = process.env.DATABASE_URL_MIGRATOR;
const dstUrl = process.env.DATABASE_URL_TARGET;
if (!srcUrl || !dstUrl) throw new Error("DATABASE_URL_MIGRATOR (source) and DATABASE_URL_TARGET are required");
if (srcUrl === dstUrl) throw new Error("source and target are the same database");

const truncate = process.argv.includes("--truncate");
const BATCH = 200;
const q = (id) => `"${id.replace(/"/g, '""')}"`;

const src = new pg.Client({ connectionString: srcUrl, connectionTimeoutMillis: 15000 });
const dst = new pg.Client({ connectionString: dstUrl, connectionTimeoutMillis: 15000 });
await src.connect();
await dst.connect();

const tablesOf = async (c) =>
  (
    await c.query(
      `select table_name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE' and table_name <> 'schema_migrations'
        order by table_name`,
    )
  ).rows.map((r) => r.table_name);

const [srcTables, dstTables] = [await tablesOf(src), await tablesOf(dst)];
const missing = srcTables.filter((t) => !dstTables.includes(t));
if (missing.length) throw new Error(`target is missing tables (run npm run db:migrate on it): ${missing.join(", ")}`);

const count = async (c, t) => Number((await c.query(`select count(*) from public.${q(t)}`)).rows[0].count);

try {
  await dst.query("begin");
  await dst.query("set local session_replication_role = replica");

  if (truncate) {
    await dst.query(`truncate ${srcTables.map((t) => `public.${q(t)}`).join(", ")} restart identity cascade`);
  } else {
    for (const t of srcTables) {
      if ((await count(dst, t)) > 0) throw new Error(`target table ${t} is not empty (use --truncate to wipe it)`);
    }
  }

  for (const t of srcTables) {
    // writable columns only: skip generated columns and GENERATED ALWAYS identity columns
    const cols = (
      await dst.query(
        `select column_name from information_schema.columns
          where table_schema = 'public' and table_name = $1
            and is_generated = 'NEVER' and coalesce(identity_generation, '') <> 'ALWAYS'
          order by ordinal_position`,
        [t],
      )
    ).rows.map((r) => q(r.column_name));
    const list = cols.join(", ");
    const total = await count(src, t);
    let done = 0;
    // keyset-free paging is fine: the source is read-only for the duration of the copy
    const cursorName = `c_${t.replace(/\W/g, "_")}`;
    await src.query("begin isolation level repeatable read read only");
    await src.query(`declare ${cursorName} cursor for select to_jsonb(t) as r from public.${q(t)} t`);
    for (;;) {
      const { rows } = await src.query(`fetch ${BATCH} from ${cursorName}`);
      if (!rows.length) break;
      await dst.query(
        `insert into public.${q(t)} (${list})
         select ${list} from jsonb_populate_recordset(null::public.${q(t)}, $1::jsonb)`,
        [JSON.stringify(rows.map((r) => r.r))],
      );
      done += rows.length;
    }
    await src.query("commit");
    console.log(`• ${t.padEnd(36)} ${done}/${total}`);
  }

  // bring serial/identity sequences up to the copied max
  const seqs = (
    await dst.query(
      `select c.table_name, c.column_name, pg_get_serial_sequence(format('public.%I', c.table_name), c.column_name) as seq
         from information_schema.columns c
        where c.table_schema = 'public' and (c.column_default like 'nextval(%' or c.is_identity = 'YES')`,
    )
  ).rows.filter((r) => r.seq);
  for (const s of seqs) {
    await dst.query(
      `select setval($1, coalesce((select max(${q(s.column_name)}) from public.${q(s.table_name)}), 0) + 1, false)`,
      [s.seq],
    );
  }

  // verify before committing
  const bad = [];
  for (const t of srcTables) {
    const [a, b] = [await count(src, t), await count(dst, t)];
    if (a !== b) bad.push(`${t}: source ${a}, target ${b}`);
  }
  if (bad.length) throw new Error(`row count mismatch:\n  ${bad.join("\n  ")}`);

  await dst.query("commit");
  console.log(`\n✓ copied ${srcTables.length} tables; row counts match`);
} catch (err) {
  await dst.query("rollback").catch(() => {});
  console.error(`\n✗ rolled back: ${err.message}`);
  process.exitCode = 1;
} finally {
  await src.end();
  await dst.end();
}
