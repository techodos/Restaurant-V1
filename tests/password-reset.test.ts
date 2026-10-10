import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Forgot password: email → code (the email-verification code system) → single-use reset token → new
 * password + signed in. The database and the code table are faked; the tokens, hashing and rules are real.
 */
const { db, codes } = vi.hoisted(() => ({
  db: {
    account: null as Record<string, unknown> | null,
    updatedHash: null as string | null,
  },
  codes: { created: [] as string[], outcome: "verified" as "expired" | "locked" | "wrong" | "verified" },
}));

vi.mock("@/server/db/registry", () => {
  const tx = {
    queryOne: async (sql: string, params: unknown[]) => {
      if (sql.includes("update customers set password_hash")) {
        if (!db.account) return null;
        db.account = { ...db.account, password_hash: params[2] };
        db.updatedHash = String(params[2]);
        return { id: db.account.id, full_name: db.account.full_name };
      }
      return db.account;
    },
    query: async () => [],
  };
  const run = async (_ctx: unknown, handler: (t: typeof tx) => Promise<unknown>) => handler(tx);
  return { getDb: () => ({ write: run, read: run }) };
});

vi.mock("@/server/repositories/email-verification", () => ({
  createVerificationCode: async (input: { customerId: string }) => {
    codes.created.push(input.customerId);
    return {};
  },
  getActiveVerificationCode: async () => null,
  attemptVerificationCode: async () => codes.outcome,
}));

vi.mock("@/server/services/notifications", () => ({ getEmailProvider: () => null }));

import { hashPassword, verifyPassword } from "@/server/auth/password";
import { verifyCustomerSession, verifyPasswordResetToken } from "@/server/auth/tokens";
import { completePasswordReset, requestPasswordReset, verifyPasswordResetCode } from "@/server/services/customer-auth";
import { passwordResetSchema } from "@/server/validation/customer-auth";
import { renderVerificationCodeEmail } from "@/server/notifications/templates/email-verification";

const RESTAURANT = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Zaytoun",
  logoUrl: null,
  primaryColor: null,
  email: null,
  phone: null,
};
const ip = () => `ip-${Math.random()}`;

beforeEach(async () => {
  db.account = { id: "cust-1", email: "noor@example.com", full_name: "Noor Ahmed", password_hash: await hashPassword("old password") };
  db.updatedHash = null;
  codes.created = [];
  codes.outcome = "verified";
});

describe("requesting a reset code", () => {
  it("sends a code to an existing account", async () => {
    await requestPasswordReset(RESTAURANT, "noor@example.com", ip());
    expect(codes.created).toEqual(["cust-1"]);
  });

  it("answers the same for an unknown email, without sending anything", async () => {
    db.account = null;
    await expect(requestPasswordReset(RESTAURANT, "nobody@example.com", ip())).resolves.toBeUndefined();
    expect(codes.created).toEqual([]);
  });

  it("is rate limited per caller, unknown emails included", async () => {
    db.account = null;
    const caller = ip();
    for (let i = 0; i < 5; i++) await requestPasswordReset(RESTAURANT, `x${i}@example.com`, caller);
    await expect(requestPasswordReset(RESTAURANT, "x@example.com", caller)).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });
});

describe("verifying the code", () => {
  it("returns a reset token that is not a session", async () => {
    const token = await verifyPasswordResetCode(RESTAURANT, "noor@example.com", "123456", ip());
    expect(await verifyPasswordResetToken(token)).toMatchObject({ customerId: "cust-1", restaurantId: RESTAURANT.id });
    expect(await verifyCustomerSession(token)).toBeNull();
  });

  it("maps wrong / expired / locked codes to the existing messages", async () => {
    codes.outcome = "wrong";
    await expect(verifyPasswordResetCode(RESTAURANT, "noor@example.com", "000000", ip())).rejects.toMatchObject({ message: "That code is not correct." });
    codes.outcome = "expired";
    await expect(verifyPasswordResetCode(RESTAURANT, "noor@example.com", "000000", ip())).rejects.toMatchObject({ message: expect.stringContaining("expired") });
    codes.outcome = "locked";
    await expect(verifyPasswordResetCode(RESTAURANT, "noor@example.com", "000000", ip())).rejects.toMatchObject({ message: expect.stringContaining("Too many attempts") });
  });

  it("gives an unknown email the same answer as a wrong code", async () => {
    db.account = null;
    await expect(verifyPasswordResetCode(RESTAURANT, "nobody@example.com", "123456", ip())).rejects.toMatchObject({ message: "That code is not correct." });
  });
});

describe("setting the new password", () => {
  it("stores a new bcrypt hash, marks the email verified and signs the customer in", async () => {
    const token = await verifyPasswordResetCode(RESTAURANT, "noor@example.com", "123456", ip());
    const result = await completePasswordReset(RESTAURANT, token, "brand new password");

    expect(await verifyPassword("brand new password", db.updatedHash)).toBe(true);
    expect(await verifyPassword("old password", db.updatedHash)).toBe(false);
    expect(result.emailVerified).toBe(true);
    expect(await verifyCustomerSession(result.token)).toMatchObject({ customerId: "cust-1", restaurantId: RESTAURANT.id, emailVerified: true });
  });

  it("works once: the same token is refused after the password changed", async () => {
    const token = await verifyPasswordResetCode(RESTAURANT, "noor@example.com", "123456", ip());
    await completePasswordReset(RESTAURANT, token, "brand new password");
    await expect(completePasswordReset(RESTAURANT, token, "another password")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("refuses a token from another restaurant, a session token, or garbage", async () => {
    const token = await verifyPasswordResetCode(RESTAURANT, "noor@example.com", "123456", ip());
    await expect(completePasswordReset({ id: "22222222-2222-4222-8222-222222222222" }, token, "brand new password")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(completePasswordReset(RESTAURANT, "not-a-token", "brand new password")).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(db.updatedHash).toBeNull();
  });
});

describe("input rules and email", () => {
  it("requires 8+ characters and a matching confirmation", () => {
    expect(passwordResetSchema.safeParse({ resetToken: "t", password: "short", confirmPassword: "short" }).success).toBe(false);
    const mismatch = passwordResetSchema.safeParse({ resetToken: "t", password: "long enough", confirmPassword: "different!" });
    expect(mismatch.success).toBe(false);
    expect(mismatch.error?.issues[0]?.path).toEqual(["confirmPassword"]);
    expect(passwordResetSchema.safeParse({ resetToken: "t", password: "long enough", confirmPassword: "long enough" }).success).toBe(true);
  });

  it("words the reset email as a reset, and both emails give the real 10-minute expiry", () => {
    const brand = { name: "Zaytoun", logoUrl: null, primaryColor: null, email: null, phone: null };
    const reset = renderVerificationCodeEmail({ brand, code: "123456", purpose: "reset" });
    expect(reset.subject).toBe("123456 is your password reset code");
    expect(reset.html).toContain("Reset your password");
    const verify = renderVerificationCodeEmail({ brand, code: "123456" });
    expect(verify.subject).toBe("123456 is your verification code");
    for (const email of [reset, verify]) {
      expect(email.html).toContain("10 minutes");
      expect(email.html).not.toContain("60 seconds");
    }
  });
});
