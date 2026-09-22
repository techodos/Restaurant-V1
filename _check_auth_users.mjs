import pg from "pg";

const url = process.env.DATABASE_URL_MIGRATOR ?? process.env.DATABASE_URL;
const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000 });
await client.connect();

const users = await client.query("select id, email, encrypted_password is not null as has_password, created_at from auth.users order by created_at");
console.log("auth.users:");
for (const row of users.rows) console.log(" ", row.id, row.email, "has_password:", row.has_password);

const members = await client.query("select id, email, role, user_id, is_active from team_members order by created_at");
console.log("\nteam_members:");
for (const row of members.rows) console.log(" ", row.email, row.role, "user_id:", row.user_id, "active:", row.is_active);

// check if a merged/public users table exists
const tables = await client.query(
  "select table_schema, table_name from information_schema.tables where table_name = 'users' order by table_schema",
);
console.log("\ntables named 'users':", tables.rows);

await client.end();
