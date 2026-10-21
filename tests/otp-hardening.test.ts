import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createCustomerAccount } from "@/server/auth/auth-service";
import { checkSharedRateLimit, resetRateLimits } from "@/server/rate-limit";
import { upsertCustomer } from "@/server/repositories/customers";
import { attemptVerificationCode, createVerificationCode } from "@/server/repositories/email-verification";
import { BELLA, testDatabase } from "./helpers/db";

/**
 * Real-Postgres checks for the OTP / account-claim hardening (2026-10-21): a resend must not reset the guess
 * counter, an old code dies when a new one is issued, a code only counts for the email the account has NOW,
 * changing a guest's email drops "verified", an upgraded guest row only stays verified when it was OTP-verified
 * moments ago, and the shared rate limiter counts atomically across concurrent callers.
 */
const restaurant = { id: BELLA.restaurantId };
const ctx = { restaurantId: restaurant.id };
const tag = () => randomUUID().slice(0, 8);
const phoneFor = () => `+9231${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
const future = () => new Date(Date.now() + 10 * 60_000);

beforeEach(() => resetRateLimits());
afterAll(async () => {
  await testDatabase.end();
});

async function guest(email: string) {
  return upsertCustomer({ restaurantId: restaurant.id, fullName: "Guest", phone: phoneFor(), email, isGuest: true }, ctx);
}
const verified = async (id: string) =>
  (await testDatabase.write({}, (tx) => tx.queryOne<{ v: boolean }>("select is_email_verified as v from customers where id = $1", [id])))!.v;
const issue = (customerId: string, email: string, codeHash: string) => createVerificationCode({ customerId, email, codeHash, expiresAt: future() });

describe("verification codes", () => {
  it("accepts the right code, once", async () => {
    const g = await guest(`ok-${tag()}@example.com`);
    await issue(g.id, g.email!, "right");
    expect(await attemptVerificationCode(g.id, "right", 5, 10)).toBe("verified");
    expect(await verified(g.id)).toBe(true);
    expect(await attemptVerificationCode(g.id, "right", 5, 10)).toBe("expired"); // consumed: no replay
  });

  it("a new code retires the old one", async () => {
    const g = await guest(`old-${tag()}@example.com`);
    await issue(g.id, g.email!, "first");
    await issue(g.id, g.email!, "second");
    expect(await attemptVerificationCode(g.id, "first", 5, 10)).toBe("wrong");
    expect(await verified(g.id)).toBe(false);
    expect(await attemptVerificationCode(g.id, "second", 5, 10)).toBe("verified");
  });

  it("asking for a new code does not reset the guess counter: 10 wrong guesses in total lock even the right code", async () => {
    const g = await guest(`brute-${tag()}@example.com`);
    for (let round = 0; round < 2; round += 1) {
      await issue(g.id, g.email!, "secret");
      for (let i = 0; i < 5; i += 1) expect(await attemptVerificationCode(g.id, "nope", 5, 10)).toBe("wrong");
      expect(await attemptVerificationCode(g.id, "nope", 5, 10)).toBe("locked");
    }
    await issue(g.id, g.email!, "secret");
    expect(await attemptVerificationCode(g.id, "secret", 5, 10)).toBe("locked");
    expect(await verified(g.id)).toBe(false);
  });

  it("concurrent guesses never exceed the per-code limit", async () => {
    const g = await guest(`race-${tag()}@example.com`);
    await issue(g.id, g.email!, "secret");
    const results = await Promise.all(Array.from({ length: 12 }, () => attemptVerificationCode(g.id, "nope", 5, 100)));
    expect(results.filter((r) => r === "wrong")).toHaveLength(5);
    const row = await testDatabase.write({}, (tx) => tx.queryOne<{ attempts: number }>("select attempts from email_verification_codes where customer_id = $1", [g.id]));
    expect(row!.attempts).toBe(5);
  });

  it("a code sent to one address cannot verify after the account's email changed", async () => {
    const g = await guest(`a-${tag()}@example.com`);
    await issue(g.id, g.email!, "secret");
    await upsertCustomer({ restaurantId: restaurant.id, fullName: "Guest", phone: g.phone, email: `b-${tag()}@example.com`, isGuest: true }, ctx);
    expect(await attemptVerificationCode(g.id, "secret", 5, 10)).toBe("expired");
    expect(await verified(g.id)).toBe(false);
  });
});

describe("guest email changes", () => {
  it("a verified guest who switches to another email is unverified again; the same email in other case is not", async () => {
    const g = await guest(`v-${tag()}@example.com`);
    await issue(g.id, g.email!, "c");
    await attemptVerificationCode(g.id, "c", 5, 10);
    expect(await verified(g.id)).toBe(true);

    await upsertCustomer({ restaurantId: restaurant.id, fullName: "Guest", phone: g.phone, email: g.email!.toUpperCase(), isGuest: true }, ctx);
    expect(await verified(g.id)).toBe(true);

    await upsertCustomer({ restaurantId: restaurant.id, fullName: "Guest", phone: g.phone, email: `other-${tag()}@example.com`, isGuest: true }, ctx);
    expect(await verified(g.id)).toBe(false);
  });
});

describe("guest row upgraded by sign-up", () => {
  it("stays verified when the email was OTP-verified moments ago (checkout: save your details)", async () => {
    const g = await guest(`fresh-${tag()}@example.com`);
    await issue(g.id, g.email!, "c");
    await attemptVerificationCode(g.id, "c", 5, 10);
    await createCustomerAccount({ restaurant, fullName: "Member", email: g.email!, phone: g.phone, password: "MemberPass#1" }, `su-${tag()}`);
    expect(await verified(g.id)).toBe(true);
  });

  it("is NOT verified for someone who merely knows the guest's phone and email", async () => {
    const g = await guest(`stale-${tag()}@example.com`);
    await testDatabase.write({}, (tx) => tx.query("update customers set is_email_verified = true where id = $1", [g.id])); // verified long ago
    await createCustomerAccount({ restaurant, fullName: "Claimer", email: g.email!, phone: g.phone, password: "ClaimerPass#1" }, `su-${tag()}`);
    expect(await verified(g.id)).toBe(false);
  });
});

describe("shared rate limiter", () => {
  it("counts in the database, so a second instance (empty in-process map) is still limited", async () => {
    const opts = { key: "otp-shared", identifier: `inst-${tag()}`, limit: 3, windowMs: 60_000 };
    for (let i = 0; i < 3; i += 1) await checkSharedRateLimit(opts);
    resetRateLimits(); // "another instance": nothing in memory
    await expect(checkSharedRateLimit(opts)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("counts atomically across concurrent callers", async () => {
    const opts = { key: "otp-race", identifier: `race-${tag()}`, limit: 5, windowMs: 60_000 };
    const outcomes = await Promise.all(
      Array.from({ length: 12 }, () =>
        checkSharedRateLimit(opts).then(
          () => "ok",
          () => "limited",
        ),
      ),
    );
    expect(outcomes.filter((o) => o === "ok")).toHaveLength(5);
  });

  it("starts a fresh window once the old one expired", async () => {
    const opts = { key: "otp-window", identifier: `window-${tag()}`, limit: 1, windowMs: 60_000 };
    await checkSharedRateLimit(opts);
    resetRateLimits();
    await expect(checkSharedRateLimit(opts)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await testDatabase.write({}, (tx) => tx.query("update rate_limits set reset_at = now() - interval '1 second'"));
    resetRateLimits();
    await expect(checkSharedRateLimit(opts)).resolves.toBeUndefined();
  });
});

describe("session epoch (password reset ends old sessions)", () => {
  it("a reset raises the epoch and the new token carries it; an old token's epoch no longer matches", async () => {
    const { resetCustomerPassword } = await import("@/server/auth/auth-service");
    const { verifyCustomerSession } = await import("@/server/auth/tokens");
    const { getSessionEpoch } = await import("@/server/repositories/customers");
    const email = `epoch-${tag()}@example.com`;
    const created = await createCustomerAccount({ restaurant, fullName: "Epoch", email, phone: phoneFor(), password: "EpochPass#1" }, `su-${tag()}`);
    const before = (await verifyCustomerSession(created.token))!;
    expect(before.epoch).toBe(0);
    expect(await getSessionEpoch(created.customerId, restaurant.id)).toBe(0);

    const reset = await resetCustomerPassword({ customerId: created.customerId, restaurantId: restaurant.id, passwordFingerprint: await fingerprint(created.customerId) }, "NewPass#12345");
    expect((await verifyCustomerSession(reset.token))!.epoch).toBe(1);
    expect(await getSessionEpoch(created.customerId, restaurant.id)).toBe(1);
    expect(before.epoch).not.toBe(await getSessionEpoch(created.customerId, restaurant.id)); // the old session is stale
  });

  it("isSessionCurrent: current epoch passes, stale or unknown account fails, guests pass", async () => {
    const { isSessionCurrent } = await import("@/server/services/customer-auth");
    const g = await guest(`cur-${tag()}@example.com`);
    expect(await isSessionCurrent(restaurant.id, { customerId: g.id, sessionEpoch: 0 })).toBe(true);
    expect(await isSessionCurrent(restaurant.id, { customerId: g.id, sessionEpoch: 3 })).toBe(false);
    expect(await isSessionCurrent(restaurant.id, { customerId: randomUUID(), sessionEpoch: 0 })).toBe(false);
    expect(await isSessionCurrent(restaurant.id, { customerId: null })).toBe(true);
  });
});

async function fingerprint(customerId: string) {
  const { passwordFingerprint } = await import("@/server/auth/auth-service");
  const row = await testDatabase.write({}, (tx) => tx.queryOne<{ h: string }>("select password_hash as h from customers where id = $1", [customerId]));
  return passwordFingerprint(row!.h);
}
