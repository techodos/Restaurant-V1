import { getDb } from "@/server/db/registry";
import { iso, str, type Row } from "@/server/db/mappers";
import type { RequestContext } from "@/server/context";

/** email_verification_codes (0018, keyed by customer since 0021) — server-only outbox for the checkout email-verify gate. */

export interface VerificationCodeRecord {
  id: string;
  customerId: string;
  email: string;
  codeHash: string;
  attempts: number;
  maxAttempts: number;
  expiresAt: string;
  consumedAt: string | null;
}

function mapRecord(row: Row): VerificationCodeRecord {
  return {
    id: str(row.id),
    customerId: str(row.customer_id),
    email: str(row.email),
    codeHash: str(row.code_hash),
    attempts: Number(row.attempts) || 0,
    maxAttempts: Number(row.max_attempts) || 5,
    expiresAt: iso(row.expires_at) ?? new Date(0).toISOString(),
    consumedAt: iso(row.consumed_at),
  };
}

export async function createVerificationCode(
  input: { customerId: string; email: string; codeHash: string; expiresAt: Date },
  ctx: RequestContext = {},
): Promise<VerificationCodeRecord> {
  const row = await getDb(ctx).write(ctx, (tx) =>
    tx.queryOne<Row>(
      `insert into email_verification_codes (customer_id, email, code_hash, expires_at)
       values ($1,$2,$3,$4) returning *`,
      [input.customerId, input.email.trim().toLowerCase(), input.codeHash, input.expiresAt.toISOString()],
    ),
  );
  if (!row) throw new Error("Unable to create the verification code");
  return mapRecord(row);
}

/**
 * The most recent still-usable (not consumed, not expired) code for this customer.
 * Privileged (`write`/`asService`): `email_verification_codes` is RLS-enabled with
 * no `app_runtime` policy (server-only, same as `notification_events` — 0018), so
 * the default `app_runtime` read always returned zero rows here regardless of
 * timing — every code looked "expired" the instant it was checked (fixed
 * 2026-09-23; the other functions in this file already used `write`).
 */
export async function getActiveVerificationCode(customerId: string, ctx: RequestContext = {}): Promise<VerificationCodeRecord | null> {
  const row = await getDb(ctx).write(ctx, (tx) =>
    tx.queryOne<Row>(
      `select * from email_verification_codes
        where customer_id = $1 and consumed_at is null and expires_at > now()
        order by created_at desc limit 1`,
      [customerId],
    ),
  );
  return row ? mapRecord(row) : null;
}

export type VerificationAttemptOutcome = "expired" | "locked" | "wrong" | "verified";

/**
 * The whole "check a code" step in ONE statement (one transaction): find the active code (row-locked,
 * so two submits cannot both spend the last attempt), count the attempt, consume it when the hash
 * matches and mark the customer verified. It used to be four transactions (read, count, consume,
 * mark verified) — ~12 round trips, several seconds on the hosted pooler — and not atomic.
 * Rules are unchanged: no active code → expired; attempts already at the row's limit → locked (not
 * counted); otherwise counted, and it matches only when the hash is equal and this attempt is within
 * `maxAttempts`.
 */
export async function attemptVerificationCode(
  customerId: string,
  codeHash: string,
  maxAttempts: number,
  ctx: RequestContext = {},
): Promise<VerificationAttemptOutcome> {
  const row = await getDb(ctx).write(ctx, (tx) =>
    tx.queryOne<Row>(
      `with active as (
         select id, code_hash, attempts, max_attempts
           from email_verification_codes
          where customer_id = $1 and consumed_at is null and expires_at > now()
          order by created_at desc limit 1
          for update
       ), attempt as (
         update email_verification_codes c
            set attempts = c.attempts + 1,
                consumed_at = case when a.code_hash = $2 and a.attempts + 1 <= $3 then now() end
           from active a
          where c.id = a.id and a.attempts < a.max_attempts
         returning c.consumed_at is not null as matched
       ), verified as (
         update customers set is_email_verified = true
          where id = $1 and is_email_verified = false and exists (select 1 from attempt where matched)
         returning id
       )
       select exists (select 1 from active) as found,
              coalesce((select attempts >= max_attempts from active), false) as locked,
              coalesce((select matched from attempt), false) as matched`,
      [customerId, codeHash, maxAttempts],
    ),
  );
  if (!row?.found) return "expired";
  if (row.locked) return "locked";
  return row.matched ? "verified" : "wrong";
}
