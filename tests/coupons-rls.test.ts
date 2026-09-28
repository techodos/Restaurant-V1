import { describe, expect, it, vi } from "vitest";

/**
 * Coupons have no app_runtime select policy (RLS only lets staff with coupons.view read the table —
 * `coupons_team_select`, migration 0006); a guest/customer validating a promo code, or the per-phone
 * usage-limit count checked at order creation, must run on the privileged connection (`.write`), the
 * same way `getCouponById` already does. Using the RLS-scoped `.query`/`.queryOne` convenience here
 * silently returned zero rows for every customer — "every live coupon says invalid", and usage limits
 * that never actually limited anything. Fixed 2026-09-28; this guards the fix from regressing.
 */
const { calls } = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock("@/server/db/registry", () => ({
  getDb: () => ({
    query: () => {
      calls.push("query");
      throw new Error("RLS-scoped read must not be used for coupons");
    },
    queryOne: () => {
      calls.push("queryOne");
      throw new Error("RLS-scoped read must not be used for coupons");
    },
    write: async (_ctx: unknown, handler: (tx: { queryOne: () => Promise<null> }) => unknown) => {
      calls.push("write");
      return handler({ queryOne: async () => null });
    },
  }),
}));

import { countCouponUsageByPhone, getCouponByCode } from "@/server/repositories/coupons";

describe("coupon reads run on the privileged connection", () => {
  it("getCouponByCode uses write/asService, not the RLS-scoped read", async () => {
    calls.length = 0;
    await getCouponByCode("r1", "WELCOME15");
    expect(calls).toEqual(["write"]);
  });

  it("countCouponUsageByPhone uses write/asService, not the RLS-scoped read", async () => {
    calls.length = 0;
    await countCouponUsageByPhone("r1", "coupon-1", "+92 300 0000000");
    expect(calls).toEqual(["write"]);
  });
});
