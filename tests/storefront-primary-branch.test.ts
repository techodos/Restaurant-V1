import { describe, expect, it } from "vitest";
import { assembleStorefrontContext } from "@/server/domain/storefront-context";
import { orderBranchId } from "@/shared/branching";
import type { Restaurant, RestaurantLocation } from "@/shared/contract/models";

/**
 * The storefront's main branch (`context.primaryLocation`): with multi-branch ordering off every order is pinned to it
 * (shared/branching.ts#orderBranchId), so it must be a branch that can take orders. Found 2026-10-27: an INACTIVE
 * primary stayed the storefront's main branch (the snapshot holds every branch), so a single-branch restaurant that
 * deactivated its main branch had every order refused ("That branch is not taking orders") although others were open
 * — while the admin (branch-scope.ts) and repositories#getPrimaryLocation already skip inactive branches. DB-free.
 */
const restaurant = { id: "r1", name: "Zaytoun", slug: "zaytoun", primaryColor: "#2f5d46" } as unknown as Restaurant;
const branch = (id: string, isPrimary: boolean, isActive: boolean) =>
  ({ id, name: id, isPrimary, isActive, hours: {}, city: "Lahore" }) as unknown as RestaurantLocation;

describe("the storefront's main branch", () => {
  it("is the active primary branch", () => {
    const context = assembleStorefrontContext(restaurant, null, [branch("walton", true, true), branch("mall", false, true)]);
    expect(context.primaryLocation?.id).toBe("walton");
  });

  it("skips a deactivated primary: the next active branch serves single-branch orders", () => {
    const context = assembleStorefrontContext(restaurant, null, [branch("walton", true, false), branch("mall", false, true)]);
    expect(context.primaryLocation?.id).toBe("mall");
    expect(orderBranchId(false, null, context.primaryLocation?.id ?? null)).toBe("mall");
  });

  it("is null when no branch is active (nothing can take an order), not an inactive branch", () => {
    const context = assembleStorefrontContext(restaurant, null, [branch("walton", true, false)]);
    expect(context.primaryLocation).toBeNull();
    expect(context.locations).toHaveLength(1); // the full list is kept for pages that filter it themselves
  });
});
