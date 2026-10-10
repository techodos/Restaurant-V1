// Samples every 5 s during a load run: Postgres connections by state, lock waits, longest running query, and
// CPU/memory of the Next servers listening on the given ports (Windows: netstat + Get-Process). CSV to stdout.
//   LOADTEST_PG_ADMIN_URL=postgresql://postgres:postgres@localhost:54329/postgres node scripts/load/monitor.mjs 720 3201,3204,3205,3202
import { execSync } from "node:child_process";
import pg from "pg";

const duration = Number(process.argv[2] ?? 600) * 1000;
const client = new pg.Client({ connectionString: process.env.LOADTEST_PG_ADMIN_URL ?? "postgresql://postgres:postgres@localhost:54329/postgres" });
await client.connect();

function pidsForPorts(ports) {
  const out = execSync("netstat -ano -p tcp", { encoding: "utf8" });
  const pids = new Map();
  for (const line of out.split("\n")) {
    const m = line.trim().split(/\s+/);
    if (m[3] === "LISTENING") for (const p of ports) if (m[1].endsWith(`:${p}`)) pids.set(p, m[4]);
  }
  return pids;
}
const PORTS = (process.argv[3] ?? "3201,3202").split(",").map(Number);
const pids = pidsForPorts(PORTS);
let lastCpu = new Map();
function procStats() {
  const result = {};
  for (const [port, pid] of pids) {
    try {
      const line = execSync(`powershell -NoProfile -Command "(Get-Process -Id ${pid} | Select-Object CPU,WorkingSet64 | ConvertTo-Json -Compress)"`, { encoding: "utf8" });
      const p = JSON.parse(line);
      const prev = lastCpu.get(port);
      const now = Date.now();
      const cpuPct = prev ? ((p.CPU - prev.cpu) / ((now - prev.t) / 1000)) * 100 : 0;
      lastCpu.set(port, { cpu: p.CPU, t: now });
      result[port] = { cpuPct: Math.round(cpuPct), rssMB: Math.round(p.WorkingSet64 / 1048576) };
    } catch {
      result[port] = null;
    }
  }
  return result;
}

const end = Date.now() + duration;
console.log(["time","conns_total","active","idle","idle_in_tx","lock_waits","longest_ms",...PORTS.flatMap((p) => [`cpu_${p}`, `mb_${p}`])].join(","));
while (Date.now() < end) {
  const [row] = (await client.query(`
    select count(*) filter (where datname = 'restaurant_platform_test')::int total,
           count(*) filter (where datname = 'restaurant_platform_test' and state = 'active')::int active,
           count(*) filter (where datname = 'restaurant_platform_test' and state = 'idle')::int idle,
           count(*) filter (where datname = 'restaurant_platform_test' and state like 'idle in transaction%')::int idle_tx,
           count(*) filter (where wait_event_type = 'Lock')::int lock_waits,
           coalesce(max(extract(epoch from now() - query_start) * 1000) filter (where state = 'active' and datname = 'restaurant_platform_test' and query not like 'LISTEN%'), 0)::int longest
      from pg_stat_activity`)).rows;
  const ps = procStats();
  console.log([new Date().toISOString().slice(11, 19), row.total, row.active, row.idle, row.idle_tx, row.lock_waits, row.longest,
    ...PORTS.flatMap((p) => [ps[p]?.cpuPct ?? "", ps[p]?.rssMB ?? ""])].join(","));
  await new Promise((r) => setTimeout(r, 5000));
}
await client.end();
