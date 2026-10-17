import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("one deployment = one restaurant (web/instance.ts)", () => {
  it("names the restaurant from NEXT_PUBLIC_DEFAULT_RESTAURANT and refuses any other slug a request carries", async () => {
    vi.stubEnv("NEXT_PUBLIC_DEFAULT_RESTAURANT", "zaytoun");
    vi.resetModules();
    const { instanceRestaurantSlug, assertInstanceRestaurant } = await import("@/web/instance");
    expect(instanceRestaurantSlug()).toBe("zaytoun");
    expect(assertInstanceRestaurant("zaytoun")).toBe("zaytoun");
    for (const other of ["bella-napoli", "ZAYTOUN", "zaytoun ", "", "../zaytoun"]) {
      expect(() => assertInstanceRestaurant(other), JSON.stringify(other)).toThrow(/Restaurant not found/);
    }
  });

  it("every storefront context, admin session check and staff sign-in goes through the guard", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("src/web/storefront.ts", "utf8")).toMatch(/loadStorefrontContext\(assertInstanceRestaurant\(slug\)\)/);
    const session = readFileSync("src/web/session.ts", "utf8");
    expect(session).toMatch(/if \(slug !== undefined && slug !== instanceRestaurantSlug\(\)\) return null;/);
    expect(session).toMatch(/signInStaff\(email, password, assertInstanceRestaurant\(restaurantSlug\), identifier\)/);
    for (const file of ["src/app/(site)/order/actions.ts", "src/app/(site)/reviews/actions.ts"]) {
      expect(readFileSync(file, "utf8")).toMatch(/requireRestaurant\(assertInstanceRestaurant\(slug\)\)/);
    }
  });
});
