import pg from "pg";

const url = process.env.DATABASE_URL_MIGRATOR ?? process.env.DATABASE_URL;
const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 10000 });
await client.connect();

const fkTarget = await client.query(`
  select
    tc.constraint_name, ccu.table_schema as ref_schema, ccu.table_name as ref_table, ccu.column_name as ref_column
  from information_schema.table_constraints tc
  join information_schema.constraint_column_usage ccu on ccu.constraint_name = tc.constraint_name
  where tc.constraint_name = 'team_members_user_id_fkey'
`);
console.log("FK now points to:", fkTarget.rows);

const tables = await client.query(
  "select table_schema, table_name from information_schema.tables where table_name = 'users'",
);
console.log("tables named users:", tables.rows);

for (const t of tables.rows) {
  const cols = await client.query(
    "select column_name, data_type from information_schema.columns where table_schema = $1 and table_name = $2 order by ordinal_position",
    [t.table_schema, t.table_name],
  );
  console.log(`\ncolumns of ${t.table_schema}.${t.table_name}:`, cols.rows.map((c) => c.column_name));
  const count = await client.query(`select count(*) from ${t.table_schema}.${t.table_name}`);
  console.log(`row count:`, count.rows[0].count);
  if (Number(count.rows[0].count) > 0) {
    const sample = await client.query(`select * from ${t.table_schema}.${t.table_name} limit 5`);
    console.log("sample rows:", sample.rows);
  }
}

await client.end();
