import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Two overlapping add-to-cart requests both find no active cart and both insert one. The one-active-cart-per-token
 * index makes the second insert lose; it used to surface as "That record already exists". getOrCreateCart must
 * instead take the winner's cart. The database is faked: `insert` yields no row (it lost the race) and the
 * following lookup returns the cart the other request created.
 */
const { script } = vi.hoisted(() => ({ script: { selects: [] as (Record<string, unknown> | null)[], statements: [] as string[] } }));
vi.mock("@/server/db/registry", () => ({
  getDb: () => ({
    asRuntime: async (_ctx: unknown, handler: (tx: unknown) => Promise<unknown>) =>
      handler({
        query: async (sql: string) => {
          script.statements.push(sql);
          return [];
        },
        queryOne: async (sql: string) => {
          script.statements.push(sql);
          if (/^\s*insert into carts/i.test(sql)) return null; // lost the race: ON CONFLICT DO NOTHING
          return script.selects.shift() ?? null;
        },
      }),
  }),
}));

import { getOrCreateCart } from "@/server/repositories/carts";

const winnerRow = {
  id: "cart-1",
  restaurant_id: "r1",
  customer_id: null,
  location_id: null,
  session_token: "tok",
  status: "active",
  currency: "PKR",
  order_type: "delivery",
};

describe("getOrCreateCart under a race", () => {
  beforeEach(() => {
    script.selects = [null, winnerRow]; // first lookup: none yet; lookup after losing the insert: the winner's cart
    script.statements = [];
  });

  it("uses an idempotent insert (ON CONFLICT DO NOTHING, whichever active-token index is live)", async () => {
    await getOrCreateCart({ restaurantId: "r1", cartToken: "tok", currency: "PKR" }, { restaurantId: "r1" });
    const insert = script.statements.find((sql) => /insert into carts/i.test(sql))!;
    expect(insert).toMatch(/on conflict do nothing/i);
  });

  it("returns the winner's cart instead of throwing when the insert loses", async () => {
    const cart = await getOrCreateCart({ restaurantId: "r1", cartToken: "tok", currency: "PKR" }, { restaurantId: "r1" });
    expect(cart.id).toBe("cart-1");
  });

  it("links a signed-in customer to the winner's cart when the winner was created as a guest cart", async () => {
    await getOrCreateCart({ restaurantId: "r1", cartToken: "tok", currency: "PKR", customerId: "cust-1" }, { restaurantId: "r1" });
    expect(script.statements.some((sql) => /update carts set customer_id/i.test(sql))).toBe(true);
  });
});
