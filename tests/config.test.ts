import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEYS = [
  "DATABASE_URL",
  "DATABASE_URL_SERVICE",
  "DB_POOL_MAX",
  "AUTH_SECRET",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_DEFAULT_RESTAURANT",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_STORAGE_BUCKET",
  "STRIPE_SECRET_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STOREFRONT_CACHE_ENABLED",
  "STOREFRONT_CACHE_REFRESH_INTERVAL_MS",
  "STOREFRONT_CACHE_STARTUP_TIMEOUT_MS",
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  vi.resetModules();
});

afterEach(() => {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

async function loadConfig() {
  return (await import("@/server/config")).config;
}

describe("config", () => {
  it("applies documented defaults", async () => {
    const config = await loadConfig();
    expect(config.app.siteUrl).toBe("http://localhost:3000");
    expect(config.app.defaultRestaurantSlug).toBe("bella-napoli");
    expect(config.storage.bucket).toBe("restaurant-media");
    expect(config.storage.supabase).toBeNull();
    expect(config.payments.stripe).toBeNull();
  });

  it("parses database settings and treats blank optional values as unset", async () => {
    process.env.DATABASE_URL = "postgresql://runtime@localhost/db";
    process.env.DATABASE_URL_SERVICE = "   ";
    process.env.DB_POOL_MAX = "4";
    const config = await loadConfig();
    expect(config.database).toEqual({ url: "postgresql://runtime@localhost/db", serviceUrl: undefined, poolMax: 4 });
  });

  it("enables Supabase storage only when both the URL and the key are present", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co/";
    expect((await loadConfig()).storage.supabase).toBeNull();

    vi.resetModules();
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
    expect((await loadConfig()).storage.supabase).toEqual({ url: "https://example.supabase.co", serviceRoleKey: "service-key" });
  });

  describe("storefront cache", () => {
    it("is on by default with a 5 minute refresh and a 60 second startup timeout", async () => {
      const config = await loadConfig();
      expect(config.storefrontCache).toEqual({ enabled: true, refreshIntervalMs: 300_000, startupTimeoutMs: 60_000 });
    });

    it("reads the switch and both durations from the environment", async () => {
      process.env.STOREFRONT_CACHE_ENABLED = "false";
      process.env.STOREFRONT_CACHE_REFRESH_INTERVAL_MS = "45000";
      process.env.STOREFRONT_CACHE_STARTUP_TIMEOUT_MS = "15000";
      const config = await loadConfig();
      expect(config.storefrontCache).toEqual({ enabled: false, refreshIntervalMs: 45_000, startupTimeoutMs: 15_000 });
    });

    it.each([
      ["true", true],
      ["TRUE", true],
      ["1", true],
      [" false ", false],
      ["0", false],
      ["", true],
    ])("parses STOREFRONT_CACHE_ENABLED=%j as %s", async (raw, expected) => {
      process.env.STOREFRONT_CACHE_ENABLED = raw;
      expect((await loadConfig()).storefrontCache.enabled).toBe(expected);
    });

    it("treats blank durations as unset", async () => {
      process.env.STOREFRONT_CACHE_REFRESH_INTERVAL_MS = "  ";
      process.env.STOREFRONT_CACHE_STARTUP_TIMEOUT_MS = "";
      const config = await loadConfig();
      expect(config.storefrontCache.refreshIntervalMs).toBe(300_000);
      expect(config.storefrontCache.startupTimeoutMs).toBe(60_000);
    });

    it.each([
      ["STOREFRONT_CACHE_ENABLED", "maybe"],
      ["STOREFRONT_CACHE_REFRESH_INTERVAL_MS", "soon"],
      ["STOREFRONT_CACHE_REFRESH_INTERVAL_MS", "10"],
      ["STOREFRONT_CACHE_REFRESH_INTERVAL_MS", "1500.5"],
      ["STOREFRONT_CACHE_REFRESH_INTERVAL_MS", "999999999"],
      ["STOREFRONT_CACHE_STARTUP_TIMEOUT_MS", "0"],
      ["STOREFRONT_CACHE_STARTUP_TIMEOUT_MS", "-5"],
    ])("rejects %s=%s and names the variable", async (key, value) => {
      process.env[key] = value;
      const config = await loadConfig();
      expect(() => config.storefrontCache).toThrow(new RegExp(`Invalid storefront cache configuration: ${key}`));
    });

    it("does not affect the other sections when its own values are invalid", async () => {
      process.env.STOREFRONT_CACHE_ENABLED = "maybe";
      const config = await loadConfig();
      expect(config.app.siteUrl).toBe("http://localhost:3000");
    });
  });

  it("names the missing variable without echoing secret values", async () => {
    process.env.AUTH_SECRET = "too-short";
    const config = await loadConfig();
    expect(() => config.auth).toThrow(/AUTH_SECRET must be at least 16 characters/);
    expect(() => config.auth).not.toThrow(/too-short/);
    expect(() => config.database).toThrow(/DATABASE_URL/);
  });
});
