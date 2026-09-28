import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Checking an email-verification code is ONE database transaction (one statement: find the active code,
 * count the attempt, consume it and mark the customer verified). It used to be four, which made the
 * step after "Verify email" take seconds on the hosted pooler. The database is faked: it records the
 * statement and parameters and answers with the row the real statement would return.
 */
const { db } = vi.hoisted(() => ({
  db: { transactions: 0, sql: "" as string, params: [] as unknown[], row: null as Record<string, unknown> | null },
}));

vi.mock("@/server/db/registry", () => {
  const run = async (_ctx: unknown, handler: (tx: unknown) => Promise<unknown>) => {
    db.transactions += 1;
    return handler({
      queryOne: async (sql: string, params: unknown[]) => {
        db.sql = sql;
        db.params = params;
        return db.row;
      },
    });
  };
  return { getDb: () => ({ write: run, read: run, asService: run }) };
});

import { config } from "@/server/config";
import { verifyEmailCode } from "@/server/services/customer-auth";
import { afterAuthPath } from "@/shared/return-to";

const hash = (code: string) => createHmac("sha256", config.auth.secret).update(code).digest("hex");

describe("verifyEmailCode", () => {
  beforeEach(() => {
    db.transactions = 0;
    db.row = null;
  });

  it("verifies in exactly one transaction, sending the hashed code (never the code itself)", async () => {
    db.row = { found: true, locked: false, matched: true };
    await expect(verifyEmailCode("cust-1", "123456")).resolves.toBeUndefined();
    expect(db.transactions).toBe(1);
    expect(db.params).toEqual(["cust-1", hash("123456"), 5]);
    expect(db.params).not.toContain("123456");
    // consume + mark verified happen in the same statement, and the code row is locked
    expect(db.sql).toMatch(/for update/);
    expect(db.sql).toMatch(/update customers set is_email_verified = true/);
  });

  it("maps every outcome to the same messages as before", async () => {
    db.row = { found: false, locked: false, matched: false };
    await expect(verifyEmailCode("cust-1", "123456")).rejects.toMatchObject({ message: "That code has expired. Request a new one." });
    db.row = null;
    await expect(verifyEmailCode("cust-1", "123456")).rejects.toMatchObject({ message: "That code has expired. Request a new one." });
    db.row = { found: true, locked: true, matched: false };
    await expect(verifyEmailCode("cust-1", "123456")).rejects.toMatchObject({ message: "Too many attempts. Request a new code." });
    db.row = { found: true, locked: false, matched: false };
    await expect(verifyEmailCode("cust-1", "000000")).rejects.toMatchObject({ message: "That code is not correct." });
    expect(db.transactions).toBe(4);
  });
});

describe("afterAuthPath", () => {
  it("returns to where the customer came from, else the storefront home — never /account", () => {
    expect(afterAuthPath("bella", "/r/bella/checkout")).toBe("/r/bella/checkout");
    expect(afterAuthPath("bella", "/r/bella/menu")).toBe("/r/bella/menu");
    expect(afterAuthPath("bella", null)).toBe("/r/bella");
    expect(afterAuthPath("bella", undefined)).toBe("/r/bella");
  });
});
