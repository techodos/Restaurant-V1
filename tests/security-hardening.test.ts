import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression tests for the 2026-10-21 security pass. DB-free: the database is faked and the SQL text/params
 * are asserted where the protection lives in the statement (the DB suites cover behaviour on a real Postgres).
 */
const { db } = vi.hoisted(() => ({
  db: { calls: [] as { sql: string; params: unknown[] }[], row: null as Record<string, unknown> | null, fail: false },
}));

vi.mock("@/server/db/registry", () => {
  const run = async (_ctx: unknown, handler: (tx: unknown) => Promise<unknown>) => {
    if (db.fail) throw new Error("relation \"rate_limits\" does not exist");
    return handler({
      queryOne: async (sql: string, params: unknown[]) => {
        db.calls.push({ sql, params });
        return db.row;
      },
    });
  };
  return { getDb: () => ({ write: run, read: run, asService: run }) };
});

import { verifyPassword, hashPassword } from "@/server/auth/password";
import { checkSharedRateLimit, resetRateLimits } from "@/server/rate-limit";
import { attemptVerificationCode, createVerificationCode, getActiveVerificationCode } from "@/server/repositories/email-verification";
import { upsertCustomer } from "@/server/repositories/customers";

beforeEach(() => {
  db.calls = [];
  db.row = null;
  db.fail = false;
  resetRateLimits();
});

describe("OTP hardening", () => {
  it("issuing a code retires earlier ones in the same statement (never via consumed_at, which means verified)", async () => {
    db.row = { id: "c1", customer_id: "u1", email: "a@b.co", code_hash: "h", attempts: 0, max_attempts: 5, expires_at: new Date().toISOString(), consumed_at: null };
    await createVerificationCode({ customerId: "u1", email: "a@b.co", codeHash: "h", expiresAt: new Date() });
    const { sql } = db.calls[0]!;
    expect(sql).toMatch(/update email_verification_codes set expires_at = now\(\)/);
    expect(sql).not.toMatch(/set consumed_at/);
  });

  it("a guess is only counted against a code sent to the account's CURRENT email, and caps guesses across resends", async () => {
    db.row = { found: true, locked: false, matched: false };
    await attemptVerificationCode("u1", "hash", 5, 10);
    const { sql, params } = db.calls[0]!;
    expect(sql).toMatch(/lower\(c\.email\) = lower\(u\.email\)/);
    expect(sql).toMatch(/created_at > now\(\) - interval '15 minutes'/);
    expect(sql).toMatch(/\(select n from recent\) < \$4/);
    expect(params).toEqual(["u1", "hash", 5, 10]);
  });

  it("an active-code lookup can be pinned to the email, so a changed address triggers a new send", async () => {
    await getActiveVerificationCode("u1", "New@Mail.com");
    expect(db.calls[0]!.sql).toMatch(/lower\(email\) = lower\(\$2\)/);
    expect(db.calls[0]!.params).toEqual(["u1", "New@Mail.com"]);
  });

  it("changing a guest's email drops the verified flag", async () => {
    db.row = { id: "g1", restaurant_id: "r1", full_name: "A", phone: "+1", email: "b@b.co", is_email_verified: false, is_guest: true };
    await upsertCustomer({ restaurantId: "r1", fullName: "A", phone: "+1", email: "b@b.co", isGuest: true }, {});
    expect(db.calls[0]!.sql).toMatch(/is_email_verified = case when nullif\(\$3,''\) is not null and lower\(\$3\) is distinct from lower\(customers\.email\)\s+then false/);
  });
});

describe("password check timing", () => {
  it("does the same bcrypt work for a missing account as for a wrong password", async () => {
    const real = await hashPassword("correct horse battery");
    const time = async (stored: string | null) => {
      const t = performance.now();
      const ok = await verifyPassword("wrong password!", stored);
      expect(ok).toBe(false);
      return performance.now() - t;
    };
    await time(real); // warm up
    const wrong = await time(real);
    const missing = await time(null);
    // before the fix `missing` was ~0 ms against ~50+ ms for a wrong password
    expect(missing).toBeGreaterThan(wrong * 0.4);
  });
});

describe("shared rate limiter", () => {
  const opts = { key: "t", identifier: "someone@example.com", limit: 2, windowMs: 60_000 };

  it("counts in the shared store, hashed (no identifier in clear), and refuses past the limit", async () => {
    db.row = { hits: 3 };
    await expect(checkSharedRateLimit(opts)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(db.calls[0]!.params[0]).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(db.calls[0]!.params)).not.toContain("someone@example.com");
  });

  it("allows calls while the shared count is within the limit", async () => {
    db.row = { hits: 2 };
    await expect(checkSharedRateLimit(opts)).resolves.toBeUndefined();
  });

  it("falls back to the in-process limit when the shared store is unavailable", async () => {
    db.fail = true;
    await expect(checkSharedRateLimit(opts)).resolves.toBeUndefined();
    await checkSharedRateLimit(opts);
    await expect(checkSharedRateLimit(opts)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});

describe("payment demo mode", () => {
  it("JAZZCASH_ENV=demo is ignored in production unless ALLOW_PAYMENT_DEMO=true", async () => {
    const run = async (nodeEnv: string, allow?: string) => {
      vi.resetModules();
      vi.stubEnv("NODE_ENV", nodeEnv);
      vi.stubEnv("JAZZCASH_ENV", "demo");
      vi.stubEnv("ALLOW_PAYMENT_DEMO", allow ?? "");
      const { config } = await import("@/server/config");
      return config.payments.jazzcash;
    };
    expect(await run("production")).toBeNull();
    expect(await run("production", "true")).toMatchObject({ env: "demo" });
    expect(await run("development")).toMatchObject({ env: "demo" });
    vi.unstubAllEnvs();
  });
});
