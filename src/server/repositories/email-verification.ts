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

export async function recordVerificationAttempt(id: string, ctx: RequestContext = {}): Promise<VerificationCodeRecord | null> {
  const row = await getDb(ctx).write(ctx, (tx) =>
    tx.queryOne<Row>(`update email_verification_codes set attempts = attempts + 1 where id = $1 returning *`, [id]),
  );
  return row ? mapRecord(row) : null;
}

export async function consumeVerificationCode(id: string, ctx: RequestContext = {}): Promise<void> {
  await getDb(ctx).write(ctx, (tx) => tx.query(`update email_verification_codes set consumed_at = now() where id = $1`, [id]));
}
