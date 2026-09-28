import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Customer sign-in is ONE database read (the account row with its verification state) plus the password
 * check, and every page view after it identifies the customer from the signed session token alone. The
 * database is faked and counts transactions; a lookup that snuck back in would show up here.
 */
const { db } = vi.hoisted(() => ({ db: { transactions: 0, row: null as Record<string, unknown> | null } }));

vi.mock("@/server/db/registry", () => {
  const count = async (_ctx: unknown, handler: (tx: unknown) => Promise<unknown>) => {
    db.transactions += 1;
    return handler({ queryOne: async () => db.row, query: async () => (db.row ? [db.row] : []) });
  };
  return { getDb: () => ({ write: count, read: count, asRuntime: count, queryOne: count, query: count }) };
});

import { hashPassword } from "@/server/auth/password";
import { resolveCustomer, signInCustomer } from "@/server/auth/auth-service";
import { verifyCustomerSession } from "@/server/auth/tokens";
import { reissueCustomerSession } from "@/server/services/customer-auth";

const RESTAURANT = { id: "11111111-1111-4111-8111-111111111111" };

describe("customer sign-in", () => {
  beforeEach(async () => {
    db.transactions = 0;
    db.row = { id: "cust-1", full_name: "Noor Ahmed", password_hash: await hashPassword("correct horse"), is_email_verified: true };
  });

  it("costs exactly one database transaction and puts the verification state in the session token", async () => {
    const result = await signInCustomer("noor@example.com", "correct horse", RESTAURANT, `ip-${Math.random()}`);
    expect(db.transactions).toBe(1);
    expect(result.emailVerified).toBe(true);
    const session = await verifyCustomerSession(result.token);
    expect(session).toMatchObject({ customerId: "cust-1", restaurantId: RESTAURANT.id, name: "Noor Ahmed", emailVerified: true });
  });

  it("refuses a wrong password with the same message as an unknown email", async () => {
    await expect(signInCustomer("noor@example.com", "wrong", RESTAURANT, `ip-${Math.random()}`)).rejects.toMatchObject({
      message: "Invalid email or password.",
    });
    db.row = null;
    await expect(signInCustomer("nobody@example.com", "correct horse", RESTAURANT, `ip-${Math.random()}`)).rejects.toMatchObject({
      message: "Invalid email or password.",
    });
  });
});

describe("the session identifies the customer without the database", () => {
  beforeEach(() => {
    db.transactions = 0;
  });

  const session = (overrides: Record<string, unknown> = {}) =>
    ({ sub: "cust-1", customerId: "cust-1", restaurantId: RESTAURANT.id, name: "Noor", emailVerified: true, ...overrides }) as never;

  it("resolves name and verification from the token, with no database read", () => {
    expect(resolveCustomer(session(), RESTAURANT.id)).toEqual({ customerId: "cust-1", name: "Noor", userId: "cust-1", emailVerified: true });
    expect(db.transactions).toBe(0);
  });

  it("ignores a session signed for another restaurant", () => {
    expect(resolveCustomer(session({ restaurantId: "other" }), RESTAURANT.id)).toBeNull();
  });

  it("reports verification as unknown (null) for a token signed before the claim existed", () => {
    expect(resolveCustomer(session({ emailVerified: undefined }), RESTAURANT.id)?.emailVerified).toBeNull();
  });

  it("re-signs a session with updated claims and keeps the rest", async () => {
    const token = await reissueCustomerSession(
      { sub: "cust-1", customerId: "cust-1", restaurantId: RESTAURANT.id, name: "Noor", emailVerified: false },
      { emailVerified: true },
    );
    expect(await verifyCustomerSession(token)).toMatchObject({ customerId: "cust-1", name: "Noor", emailVerified: true });
    const renamed = await reissueCustomerSession(
      { sub: "cust-1", customerId: "cust-1", restaurantId: RESTAURANT.id, name: "Noor", emailVerified: true },
      { name: "Noor A." },
    );
    expect(await verifyCustomerSession(renamed)).toMatchObject({ name: "Noor A.", emailVerified: true });
  });
});
