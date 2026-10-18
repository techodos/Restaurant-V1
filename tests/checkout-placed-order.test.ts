import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * DB-free: the "just placed an order" marker that stops /checkout from redirecting to the menu while the
 * browser hands off to the payment gateway (see `markOrderPlaced` in web/storefront.ts).
 */

const jar = new Map<string, { value: string; options?: Record<string, unknown> }>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)!.value } : undefined),
    set: (name: string, value: string, options?: Record<string, unknown>) => void jar.set(name, { value, options }),
    delete: (name: string) => void jar.delete(name),
  }),
}));

const { markOrderPlaced, readPlacedOrder } = await import("@/web/storefront");

describe("placed-order marker", () => {
  beforeEach(() => jar.clear());

  it("round-trips the order number for this restaurant only", async () => {
    await markOrderPlaced("zaytoun", "L5JY-APGUU");
    expect(await readPlacedOrder("zaytoun")).toBe("L5JY-APGUU");
    expect(await readPlacedOrder("other")).toBeNull();
  });

  it("is short-lived, httpOnly and site-wide", async () => {
    await markOrderPlaced("zaytoun", "L5JY-APGUU");
    expect(jar.get("placed_zaytoun")?.options).toMatchObject({ path: "/", maxAge: 120, httpOnly: true, sameSite: "lax" });
  });

  it("ignores a value that is not an order number", async () => {
    jar.set("placed_zaytoun", { value: "<script>alert(1)</script>" });
    expect(await readPlacedOrder("zaytoun")).toBeNull();
  });

  it("is absent until an order is placed", async () => {
    expect(await readPlacedOrder("zaytoun")).toBeNull();
  });
});
