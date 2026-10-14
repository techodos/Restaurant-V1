import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("reverse geocoding (Nominatim)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  async function load() {
    return import("@/server/services/geocoding");
  }

  it("formats a Nominatim response into the shared ResolvedLocation address shape", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({
        display_name: "123 Main St, Lahore, Punjab, Pakistan",
        address: { house_number: "123", road: "Main St", suburb: "Gulberg", city: "Lahore", postcode: "54000" },
      }),
    });
    const { reverseGeocode } = await load();
    const result = await reverseGeocode(31.52, 74.35);
    expect(result).toEqual({
      formattedAddress: "123 Main St, Lahore, Punjab, Pakistan",
      addressLine1: "123 Main St",
      area: "Gulberg",
      city: "Lahore",
      postalCode: "54000",
    });
    const call = (fetch as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(String(call[0])).toContain("/reverse");
    const headers = call[1].headers as Record<string, string>;
    expect(headers["User-Agent"]).toContain("restaurant-platform");
  });

  it("strips a cantonment suffix so the city matches the parent city delivery zones are keyed on", async () => {
    const { reverseGeocode } = await load();
    const cases: [string, string][] = [
      ["Lahore Cant", "Lahore"],
      ["Lahore Cantt", "Lahore"],
      ["Lahore Cantonment", "Lahore"],
      ["Rawalpindi Cantt.", "Rawalpindi"],
      ["Lahore", "Lahore"], // not a cantonment: unchanged
    ];
    for (const [city, expected] of cases) {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ display_name: "Walton, " + city, address: { suburb: "Walton", city } }),
      });
      expect((await reverseGeocode(31.49, 74.36))?.city).toBe(expected);
    }
  }, 10_000);

  it("returns null (never throws) on a non-OK response, an error body, or a network failure", async () => {
    const { reverseGeocode } = await load();

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) });
    expect(await reverseGeocode(0, 0)).toBeNull();

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, json: async () => ({ error: "Unable to geocode" }) });
    expect(await reverseGeocode(0, 0)).toBeNull();

    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("network down"));
    expect(await reverseGeocode(0, 0)).toBeNull();
  });

  it("throttles consecutive requests to at least ~1.1s apart (Nominatim's 1 req/s usage policy)", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ display_name: "Somewhere", address: {} }),
    });
    const { reverseGeocode } = await load();
    const start = Date.now();
    await Promise.all([reverseGeocode(1, 1), reverseGeocode(2, 2), reverseGeocode(3, 3)]);
    expect(Date.now() - start).toBeGreaterThanOrEqual(2_000);
  }, 10_000);
});
