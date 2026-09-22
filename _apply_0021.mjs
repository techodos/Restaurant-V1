import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import pg from "pg";

const url = process.env.DATABASE_URL_MIGRATOR ?? process.env.DATABASE_URL;
const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000 });
await client.connect();

const file = "0021_restore_team_members_auth_users_fk.sql";
const sql = await readFile(`db/migrations/${file}`, "utf8");
const checksum = createHash("sha256").update(sql).digest("hex").slice(0, 16);

const existing = await client.query("select checksum from schema_migrations where version = $1", [file]);
if (existing.rows.length) {
  console.log("already recorded:", existing.rows[0].checksum, "vs", checksum);
} else {
  await client.query("begin");
  try {
    await client.query(sql);
    await client.query("insert into schema_migrations (version, checksum) values ($1,$2)", [file, checksum]);
    await client.query("commit");
    console.log("applied", file, checksum);
  } catch (error) {
    await client.query("rollback");
    console.error("failed:", error.message);
    process.exitCode = 1;
  }
}

const check = await client.query(
  "select tm.email, tm.user_id, u.email as auth_email from team_members tm left join auth.users u on u.id = tm.user_id order by tm.email",
);
console.log("team_members after fix:");
for (const row of check.rows) console.log(" ", row.email, "->", row.user_id, "(", row.auth_email, ")");

await client.end();
