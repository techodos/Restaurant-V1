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
  // A fresh code retires every earlier one (expires_at = now(), never consumed_at: that column means "verified"),
  // so only the newest code can ever be redeemed. Same statement, so two racing sends cannot leave two live codes.
  const row = await getDb(ctx).write(ctx, (tx) =>
    tx.queryOne<Row>(
      `with retired as (
         update email_verification_codes set expires_at = now()
          where customer_id = $1 and consumed_at is null and expires_at > now()
       )
       insert into email_verification_codes (customer_id, email, code_hash, expires_at)
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
export async function getActiveVerificationCode(customerId: string, email?: string, ctx: RequestContext = {}): Promise<VerificationCodeRecord | null> {
  const row = await getDb(ctx).write(ctx, (tx) =>
    tx.queryOne<Row>(
      // `email` (when given): a code sent to another address does not count, so changing the email re-sends
      `select * from email_verification_codes
        where customer_id = $1 and consumed_at is null and expires_at > now()
          and ($2::text is null or lower(email) = lower($2))
        order by created_at desc limit 1`,
      [customerId, email?.trim() ?? null],
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
  maxRecentAttempts: number,
  ctx: RequestContext = {},
): Promise<VerificationAttemptOutcome> {
  const row = await getDb(ctx).write(ctx, (tx) =>
    tx.queryOne<Row>(
      `with active as (
         -- the code must have been sent to the address the account has NOW (a guest can change it after a send)
         select c.id, c.code_hash, c.attempts, c.max_attempts
           from email_verification_codes c
           join customers u on u.id = c.customer_id
          where c.customer_id = $1 and c.consumed_at is null and c.expires_at > now()
            and lower(c.email) = lower(u.email)
          order by c.created_at desc limit 1
          for update of c
       ), recent as (
         -- failed guesses across ALL of this customer's recent codes: asking for a new code must not reset the counter
         select coalesce(sum(attempts), 0) as n from email_verification_codes
          where customer_id = $1 and created_at > now() - interval '15 minutes'
       ), attempt as (
         update email_verification_codes c
            set attempts = c.attempts + 1,
                consumed_at = case when a.code_hash = $2 and a.attempts + 1 <= $3 then now() end
           from active a
          where c.id = a.id and a.attempts < a.max_attempts and (select n from recent) < $4
         returning c.consumed_at is not null as matched
       ), verified as (
         update customers set is_email_verified = true
          where id = $1 and is_email_verified = false and exists (select 1 from attempt where matched)
         returning id
       )
       select exists (select 1 from active) as found,
              coalesce((select attempts >= max_attempts from active), false) or (select n from recent) >= $4 as locked,
              coalesce((select matched from attempt), false) as matched`,
      [customerId, codeHash, maxAttempts, maxRecentAttempts],
    ),
  );
  if (!row?.found) return "expired";
  if (row.locked) return "locked";
  return row.matched ? "verified" : "wrong";
}

/** Retires a code whose email never went out, so the next "ensure" sends a fresh one instead of waiting out the TTL. */
export async function expireVerificationCode(id: string, ctx: RequestContext = {}): Promise<void> {
  await getDb(ctx).write(ctx, (tx) => tx.queryOne<Row>(`update email_verification_codes set expires_at = now() where id = $1 returning id`, [id]));
}
