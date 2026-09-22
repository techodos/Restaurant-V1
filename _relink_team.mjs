import pg from "pg";

const url = process.env.DATABASE_URL_MIGRATOR ?? process.env.DATABASE_URL;
const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000 });
await client.connect();

const before = await client.query(
  "select tm.email, tm.user_id, u.id as matching_auth_id from team_members tm left join auth.users u on lower(u.email) = lower(tm.email) order by tm.email",
);
console.log("before:");
for (const row of before.rows) console.log(" ", row.email, "current user_id:", row.user_id, "should be:", row.matching_auth_id);

const result = await client.query(`
  update team_members tm
     set user_id = u.id
    from auth.users u
   where lower(u.email) = lower(tm.email)
     and tm.user_id is distinct from u.id
  returning tm.email, tm.user_id
`);
console.log("\nrelinked rows:", result.rows.length);
for (const row of result.rows) console.log(" ", row.email, "->", row.user_id);

await client.end();
