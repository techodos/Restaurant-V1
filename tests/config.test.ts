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

  it("names the missing variable without echoing secret values", async () => {
    process.env.AUTH_SECRET = "too-short";
    const config = await loadConfig();
    expect(() => config.auth).toThrow(/AUTH_SECRET must be at least 16 characters/);
    expect(() => config.auth).not.toThrow(/too-short/);
    expect(() => config.database).toThrow(/DATABASE_URL/);
  });
});
