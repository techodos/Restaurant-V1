import { getDb } from "@/server/db/registry";
import type { Row } from "@/server/db/mappers";

/** rate_limits (0045): server-only counters shared by every app instance. */

/**
 * Counts one hit in `bucket` (a hash) and returns how many hits the current window has. ONE atomic upsert,
 * so concurrent instances cannot undercount; an expired window restarts at 1. Expired rows are swept
 * occasionally (about 2% of calls) so the table stays small.
 */
export async function hitRateLimit(bucket: string, windowMs: number): Promise<number> {
  const row = await getDb({}).write({}, (tx) =>
    tx.queryOne<Row>(
      `with swept as (
         delete from rate_limits where random() < 0.02 and reset_at < now() - interval '1 hour'
       )
       insert into rate_limits (bucket, hits, reset_at)
       values ($1, 1, now() + ($2::int * interval '1 millisecond'))
       on conflict (bucket) do update set
         hits = case when rate_limits.reset_at <= now() then 1 else rate_limits.hits + 1 end,
         reset_at = case when rate_limits.reset_at <= now() then excluded.reset_at else rate_limits.reset_at end
       returning hits`,
      [bucket, windowMs],
    ),
  );
  return Number(row?.hits) || 1;
}
