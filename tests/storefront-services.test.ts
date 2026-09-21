import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { restaurant, storefrontData } from "./helpers/storefront-data";

/**
 * Storefront services with the cache on and off. Repositories are mocked, so this
 * verifies the call graph — which reads reach PostgreSQL and which do not —
 * without a database.
 */

const repo = vi.hoisted(() => ({
  loadStorefrontData: vi.fn(),
  listCategories: vi.fn(),
  listMenuItems: vi.fn(),
  getMenuItem: vi.fn(),
  getRestaurantBySlug: vi.fn(),
  listLocations: vi.fn(),
  listDeliveryZones: vi.fn(),
  getWebsite: vi.fn(),
  getHomePage: vi.fn(),
  listPublicReviews: vi.fn(),
  getRatingBreakdown: vi.fn(),
}));

vi.mock("@/server/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/repositories/storefront", () => ({ loadStorefrontData: repo.loadStorefrontData }));
vi.mock("@/server/repositories/menu", async (original) => ({
  ...(await original<object>()),
  listCategories: repo.listCategories,
  listMenuItems: repo.listMenuItems,
  getMenuItem: repo.getMenuItem,
}));
vi.mock("@/server/repositories/restaurants", async (original) => ({
  ...(await original<object>()),
  getRestaurantBySlug: repo.getRestaurantBySlug,
  listLocations: repo.listLocations,
}));
vi.mock("@/server/repositories/deliveries", async (original) => ({
  ...(await original<object>()),
  listDeliveryZones: repo.listDeliveryZones,
}));
vi.mock("@/server/repositories/websites", async (original) => ({
  ...(await original<object>()),
  getWebsite: repo.getWebsite,
  getHomePage: repo.getHomePage,
}));
vi.mock("@/server/repositories/reviews", async (original) => ({
  ...(await original<object>()),
  listPublicReviews: repo.listPublicReviews,
  getRatingBreakdown: repo.getRatingBreakdown,
}));

const ENV_KEYS = [
  "STOREFRONT_CACHE_ENABLED",
  "STOREFRONT_CACHE_REFRESH_INTERVAL_MS",
  "STOREFRONT_CACHE_STARTUP_TIMEOUT_MS",
  "NEXT_PUBLIC_DEFAULT_RESTAURANT",
] as const;
const savedEnv: Record<string, string | undefined> = {};

type CacheGlobal = { __storefrontCache?: { stop(): void } };

beforeEach(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  process.env.NEXT_PUBLIC_DEFAULT_RESTAURANT = "bella-napoli";
  for (const fn of Object.values(repo)) fn.mockReset();
  repo.loadStorefrontData.mockResolvedValue(storefrontData());
});

afterEach(() => {
  (globalThis as CacheGlobal).__storefrontCache?.stop();
  delete (globalThis as CacheGlobal).__storefrontCache;
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

/** A fresh module graph, as if the process had just started. */
async function boot(enabled: boolean) {
  process.env.STOREFRONT_CACHE_ENABLED = String(enabled);
  vi.resetModules();
  delete (globalThis as CacheGlobal).__storefrontCache;
  const cache = await import("@/server/cache");
  return {
    cache,
    storefront: await import("@/server/services/storefront"),
    catalog: await import("@/server/services/catalog"),
    restaurants: await import("@/server/services/restaurants"),
    reviews: await import("@/server/services/reviews"),
  };
}

const RID = storefrontData().restaurant.id;

/** Every repository the storefront read path used to hit per request. */
function expectNoStorefrontQueries() {
  const { loadStorefrontData: _load, ...reads } = repo;
  for (const [name, fn] of Object.entries(reads)) expect(fn, name).not.toHaveBeenCalled();
}

describe("storefront reads with the cache ready", () => {
  it("serves every storefront read from memory: zero repository calls after startup", async () => {
    const app = await boot(true);
    await app.cache.startStorefrontCache();
    expect(repo.loadStorefrontData).toHaveBeenCalledTimes(1);
    expect(repo.loadStorefrontData).toHaveBeenCalledWith("bella-napoli");

    const context = await app.storefront.loadStorefrontContext("bella-napoli");
    expect(context.restaurant.name).toBe("Bella Napoli");
    expect(context.primaryLocation?.id).toBe("loc-1");
    expect((await app.storefront.getHomePageContent(RID))?.slug).toBe("home");

    expect((await app.catalog.getMenuCategories(RID, { withCounts: true })).map((c) => c.itemCount)).toEqual([2, 2]);
    expect(await app.catalog.searchMenu(RID, { categorySlug: "pizza" })).toHaveLength(2);
    expect((await app.catalog.findMenuItemBySlug(RID, "cola"))?.id).toBe("i-cola");

    expect(await app.restaurants.getLocations(RID, { activeOnly: true })).toHaveLength(1);
    expect(await app.restaurants.getDeliveryZones(RID, { activeOnly: true })).toHaveLength(1);

    expect(await app.reviews.getPublicReviews(RID, { limit: 2 })).toHaveLength(2);
    expect((await app.reviews.getReviewSummary(RID)).count).toBe(2);

    expect(repo.loadStorefrontData).toHaveBeenCalledTimes(1); // no reload either
    expectNoStorefrontQueries();
  });

  it("returns the same context object on every call (no per-request rebuild)", async () => {
    const app = await boot(true);
    await app.cache.startStorefrontCache();
    expect(await app.storefront.loadStorefrontContext("bella-napoli")).toBe(await app.storefront.loadStorefrontContext("bella-napoli"));
  });

  it("answers for exactly one restaurant: another slug or id is NOT_FOUND, without touching the database", async () => {
    const app = await boot(true);
    await app.cache.startStorefrontCache();

    await expect(app.storefront.loadStorefrontContext("sakura")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(app.catalog.searchMenu("another-restaurant-id")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(app.restaurants.getLocations("another-restaurant-id")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expectNoStorefrontQueries();
  });

  it("hides a suspended or closed restaurant, as the database path does", async () => {
    repo.loadStorefrontData.mockResolvedValue(storefrontData({ restaurant: restaurant({ status: "suspended" }) }));
    const app = await boot(true);
    await app.cache.startStorefrontCache();
    await expect(app.storefront.loadStorefrontContext("bella-napoli")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("shows new data after a refresh, without a restart", async () => {
    const app = await boot(true);
    await app.cache.startStorefrontCache();
    expect(await app.catalog.searchMenu(RID, { search: "calzone" })).toHaveLength(0);

    const next = storefrontData();
    const calzone = next.menu[0]!;
    next.menu = [
      ...next.menu,
      { ...calzone, item: { ...calzone.item, id: "i-calzone", name: "Calzone", slug: "calzone" }, summary: { ...calzone.summary, id: "i-calzone", name: "Calzone", slug: "calzone" } },
    ];
    repo.loadStorefrontData.mockResolvedValue(next);
    await app.cache.getStorefrontCache().refresh();

    expect(await app.catalog.searchMenu(RID, { search: "calzone" })).toHaveLength(1);
  });

  it("keeps serving the last good data when a refresh fails", async () => {
    const app = await boot(true);
    await app.cache.startStorefrontCache();

    repo.loadStorefrontData.mockRejectedValue(new Error("connection terminated"));
    await expect(app.cache.getStorefrontCache().refresh()).rejects.toThrow("connection terminated");

    expect(await app.catalog.searchMenu(RID)).toHaveLength(4);
    expectNoStorefrontQueries();
  });
});

describe("what deliberately stays on PostgreSQL", () => {
  it("keeps slug resolution for writes, and delivery zones for pricing/checkout, on the database", async () => {
    repo.getRestaurantBySlug.mockResolvedValue(restaurant());
    repo.listDeliveryZones.mockResolvedValue([]);
    const app = await boot(true);
    await app.cache.startStorefrontCache();

    await app.restaurants.requireRestaurant("bella-napoli");
    expect(repo.getRestaurantBySlug).toHaveBeenCalledTimes(1);

    await app.restaurants.getLiveDeliveryZones(RID, { activeOnly: true });
    expect(repo.listDeliveryZones).toHaveBeenCalledTimes(1);
  });

  it("does not let the cart pricing path read zones from the snapshot", async () => {
    const { readFileSync } = await import("node:fs");
    const cart = readFileSync("src/server/services/cart.ts", "utf8");
    expect(cart).toMatch(/getLiveDeliveryZones/);
    expect(cart).not.toMatch(/\bgetDeliveryZones\b/);
    expect(cart).not.toMatch(/@\/server\/cache/);
  });
});

describe("startup", () => {
  it("fails startup when the first load fails, and does not fall back to per-request database reads", async () => {
    repo.loadStorefrontData.mockRejectedValue(new Error("db down"));
    const app = await boot(true);

    await expect(app.cache.startStorefrontCache()).rejects.toThrow("db down");
    expect(app.cache.getStorefrontCache().isReady()).toBe(false);

    await expect(app.storefront.loadStorefrontContext("bella-napoli")).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
    await expect(app.catalog.searchMenu(RID)).rejects.toMatchObject({ code: "INTERNAL_ERROR" });
    expectNoStorefrontQueries();
  });

  it("fails startup with a fixable message when the configured restaurant does not exist", async () => {
    repo.loadStorefrontData.mockResolvedValue(null);
    const app = await boot(true);
    await expect(app.cache.startStorefrontCache()).rejects.toThrow(/"bella-napoli" was not found.*NEXT_PUBLIC_DEFAULT_RESTAURANT/);
  });

  it("is idempotent: a repeated startup hook (dev reload) does not load or schedule twice", async () => {
    const app = await boot(true);
    await app.cache.startStorefrontCache();
    await app.cache.startStorefrontCache();
    expect(repo.loadStorefrontData).toHaveBeenCalledTimes(1);
  });

  it("shares one cache across module reloads in the same process (dev HMR, separate Next bundles)", async () => {
    const first = await boot(true);
    await first.cache.startStorefrontCache();
    const instance = first.cache.getStorefrontCache();

    vi.resetModules();
    const reloaded = await import("@/server/cache");
    expect(reloaded.getStorefrontCache()).toBe(instance);
    await reloaded.startStorefrontCache();
    expect(repo.loadStorefrontData).toHaveBeenCalledTimes(1);
  });
});

describe("cache disabled (STOREFRONT_CACHE_ENABLED=false)", () => {
  it("does not load at startup and answers from the database exactly as before", async () => {
    repo.getRestaurantBySlug.mockResolvedValue(restaurant());
    repo.getWebsite.mockResolvedValue(null);
    repo.listLocations.mockResolvedValue([]);
    repo.listMenuItems.mockResolvedValue([]);
    repo.listCategories.mockResolvedValue([]);
    repo.getMenuItem.mockResolvedValue(null);
    repo.getHomePage.mockResolvedValue(null);
    repo.listPublicReviews.mockResolvedValue([]);
    repo.getRatingBreakdown.mockResolvedValue({ average: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } });
    repo.listDeliveryZones.mockResolvedValue([]);
    const app = await boot(false);

    await app.cache.startStorefrontCache();
    expect(repo.loadStorefrontData).not.toHaveBeenCalled();

    const context = await app.storefront.loadStorefrontContext("bella-napoli");
    expect(context.restaurant.slug).toBe("bella-napoli");
    // other slugs resolve through the database too: multi-restaurant behaviour is unchanged when off
    expect(repo.getRestaurantBySlug).toHaveBeenCalledWith("bella-napoli");

    await app.catalog.searchMenu(RID, { search: "x" });
    await app.catalog.getMenuCategories(RID);
    await app.catalog.findMenuItemBySlug(RID, "x");
    await app.restaurants.getLocations(RID);
    await app.restaurants.getDeliveryZones(RID);
    await app.storefront.getHomePageContent(RID);
    await app.reviews.getPublicReviews(RID);
    await app.reviews.getReviewSummary(RID);

    for (const name of ["listMenuItems", "listCategories", "getMenuItem", "listLocations", "listDeliveryZones", "getHomePage", "listPublicReviews", "getRatingBreakdown"] as const) {
      expect(repo[name], name).toHaveBeenCalled();
    }
  });

  it("the storefront filters reach the repository unchanged", async () => {
    repo.listMenuItems.mockResolvedValue([]);
    const app = await boot(false);
    await app.catalog.searchMenu(RID, { categorySlug: "pizza", orderBy: "price_asc", limit: 5 });
    expect(repo.listMenuItems).toHaveBeenCalledWith(RID, { categorySlug: "pizza", orderBy: "price_asc", limit: 5 }, expect.objectContaining({ restaurantId: RID }));
  });
});
