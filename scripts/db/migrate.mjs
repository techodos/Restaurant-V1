#!/usr/bin/env node
/**
 * SQL-first migration runner.
 *   npm run db:migrate            apply pending migrations
 *   npm run db:migrate -- --fresh drop & recreate the public schema first
 * Files in db/migrations/*.sql run in lexical order, each in its own transaction.
 * Runs as DATABASE_URL_MIGRATOR (schema owner) so RLS does not apply.
 */
import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import pg from "pg";

const url = process.env.DATABASE_URL_MIGRATOR ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL_MIGRATOR is required");

const fresh = process.argv.includes("--fresh");
const dir = path.resolve("db/migrations");

const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000 });
await client.connect();

await client.query(`
  create table if not exists schema_migrations (
    version    text primary key,
    checksum   text not null,
    applied_at timestamptz not null default now()
  );
  create schema if not exists app;
`);

if (fresh) {
  console.log("• --fresh: dropping schemas");
  for (const schema of ["public", "app"]) {
    await client.query(`drop schema if exists ${schema} cascade; create schema ${schema};`);
  }
}

const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
const applied = new Map(
  (await client.query("select version, checksum from schema_migrations")).rows.map((r) => [r.version, r.checksum]),
);

let count = 0;
for (const file of files) {
  const sql = await readFile(path.join(dir, file), "utf8");
  const checksum = createHash("sha256").update(sql).digest("hex").slice(0, 16);
  const previous = applied.get(file);

  if (previous === checksum) {
    console.log(`✓ ${file} (up to date)`);
    continue;
  }
  if (previous && previous !== checksum) {
    throw new Error(`${file} was modified after being applied (${previous} → ${checksum}). Roll forward with a new migration.`);
  }

  process.stdout.write(`→ ${file} ... `);
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("insert into schema_migrations (version, checksum) values ($1,$2)", [file, checksum]);
    await client.query("commit");
    console.log("applied");
    count += 1;
  } catch (error) {
    await client.query("rollback");
    console.error(`\n✗ ${file} failed: ${error.message}`);
    if (error.position) {
      const upto = sql.slice(0, Number(error.position));
      console.error(`  at line ${upto.split("\n").length}`);
    }
    process.exitCode = 1;
    break;
  }
}

if (process.exitCode) console.error("\nMigration run failed.");
else console.log(count ? `\n${count} migration(s) applied.` : "\nDatabase already up to date.");
await client.end();
