import { describe, expect, it } from "vitest";
import { deliveryPricingSchema, matchDeliverySlab, parseDeliveryPricing } from "@/shared/delivery-pricing";
import { resolveDeliveryFee } from "@/server/repositories/deliveries";

// the example table from the brief: 0–1 → 100, >1–3 → 120, >3–5 → 150, >5–8 → 200, >8 → unavailable
const PRICING = deliveryPricingSchema.parse({
  slabs: [
    { maxKm: 1, fee: 100 },
    { maxKm: 3, fee: 120 },
    { maxKm: 5, fee: 150 },
    { maxKm: 8, fee: 200 },
  ],
});

describe("matchDeliverySlab: every boundary from the brief", () => {
  const cases: [number, number | null][] = [
    [0.5, 100],
    [1, 100], // exactly the boundary belongs to the lower slab
    [1.01, 120],
    [3, 120],
    [3.1, 150],
    [5, 150],
    [6, 200],
    [8, 200],
    [8.01, null], // beyond every slab: delivery unavailable
    [50, null],
  ];
  for (const [distanceKm, expectedFee] of cases) {
    it(`${distanceKm} km → ${expectedFee === null ? "unavailable" : `Rs ${expectedFee}`}`, () => {
      const slab = matchDeliverySlab(PRICING, distanceKm);
      expect(slab?.fee ?? null).toBe(expectedFee);
    });
  }
});

describe("deliveryPricingSchema: validation and data integrity", () => {
  it("rejects slabs that are not strictly ascending (overlap or gap-adjacent duplicate)", () => {
    expect(deliveryPricingSchema.safeParse({ slabs: [{ maxKm: 3, fee: 100 }, { maxKm: 3, fee: 120 }] }).success).toBe(false);
    expect(deliveryPricingSchema.safeParse({ slabs: [{ maxKm: 5, fee: 100 }, { maxKm: 3, fee: 120 }] }).success).toBe(false);
  });

  it("rejects a non-positive distance or a negative fee", () => {
    expect(deliveryPricingSchema.safeParse({ slabs: [{ maxKm: 0, fee: 100 }] }).success).toBe(false);
    expect(deliveryPricingSchema.safeParse({ slabs: [{ maxKm: -1, fee: 100 }] }).success).toBe(false);
    expect(deliveryPricingSchema.safeParse({ slabs: [{ maxKm: 1, fee: -5 }] }).success).toBe(false);
  });

  it("requires at least one slab (an empty array means 'not configured', expressed by omitting the key, not an empty list)", () => {
    expect(deliveryPricingSchema.safeParse({ slabs: [] }).success).toBe(false);
  });

  it("the ascending-maxKm shape makes a gap or overlap structurally impossible once valid — every distance from 0 up to the last maxKm matches exactly one slab", () => {
    for (let km = 0.1; km <= 8; km += 0.1) {
      const matches = PRICING.slabs.filter((slab, index) => {
        const from = index === 0 ? 0 : PRICING.slabs[index - 1]!.maxKm;
        return km > from && km <= slab.maxKm;
      });
      expect(matches).toHaveLength(1);
    }
  });
});

describe("parseDeliveryPricing: tolerant reader (missing/invalid/legacy config never throws)", () => {
  it("treats missing, null, non-object or malformed data as 'not configured'", () => {
    expect(parseDeliveryPricing(undefined)).toBeNull();
    expect(parseDeliveryPricing(null)).toBeNull();
    expect(parseDeliveryPricing("not an object")).toBeNull();
    expect(parseDeliveryPricing({})).toBeNull();
    expect(parseDeliveryPricing({ slabs: "not an array" })).toBeNull();
    expect(parseDeliveryPricing({ slabs: [{ maxKm: 3, fee: 100 }, { maxKm: 1, fee: 50 }] })).toBeNull(); // out of order
  });

  it("parses a well-formed config", () => {
    expect(parseDeliveryPricing({ slabs: [{ maxKm: 1, fee: 100 }] })?.slabs).toHaveLength(1);
  });
});

describe("resolveDeliveryFee: availability (zone) stays separate from fee (slabs)", () => {
  const branchPin = { latitude: 31.5, longitude: 74.3 };
  const nearPin = { latitude: 31.5, longitude: 74.315 }; // ~1.5 km away: lands in the >1–3 km slab
  const farPin = { latitude: 31.6, longitude: 74.5 }; // well beyond 8 km

  it("falls back to the zone's flat fee when distance pricing is not configured", () => {
    const result = resolveDeliveryFee("250.00", { ...branchPin, settings: {} }, nearPin);
    expect(result).toEqual({ fee: "250.00", distanceKm: null, tooFar: false });
  });

  it("falls back to the flat fee when pricing is configured but the customer gave no pin (typed address only)", () => {
    const result = resolveDeliveryFee("250.00", { ...branchPin, settings: { deliveryPricing: PRICING } }, null);
    expect(result).toEqual({ fee: "250.00", distanceKm: null, tooFar: false });
  });

  it("falls back to the flat fee when the branch itself has no pin", () => {
    const result = resolveDeliveryFee("250.00", { settings: { deliveryPricing: PRICING } }, nearPin);
    expect(result).toEqual({ fee: "250.00", distanceKm: null, tooFar: false });
  });

  it("overrides the flat fee with the matching slab's fixed fee when both pins and pricing are present", () => {
    const result = resolveDeliveryFee("999.00", { ...branchPin, settings: { deliveryPricing: PRICING } }, nearPin);
    expect(result.tooFar).toBe(false);
    expect(result.fee).toBe("120.00");
    expect(result.distanceKm).toBeGreaterThan(0);
  });

  it("the fee is a FIXED slab amount, never distance × a per-km rate", () => {
    // two different distances inside the same slab (>1–3 km) charge the identical fee
    const a = resolveDeliveryFee("0", { ...branchPin, settings: { deliveryPricing: PRICING } }, { latitude: 31.5, longitude: 74.312 });
    const b = resolveDeliveryFee("0", { ...branchPin, settings: { deliveryPricing: PRICING } }, { latitude: 31.5, longitude: 74.33 });
    expect(a.fee).toBe("120.00");
    expect(b.fee).toBe("120.00");
    expect(a.distanceKm).not.toBe(b.distanceKm);
  });

  it("refuses delivery (tooFar) when the customer is beyond every configured slab, even though a zone matched by name/area", () => {
    const result = resolveDeliveryFee("250.00", { ...branchPin, settings: { deliveryPricing: PRICING } }, farPin);
    expect(result.tooFar).toBe(true);
    expect(result.distanceKm).toBeGreaterThan(8);
  });

  it("a malformed stored config (legacy/corrupt row) is read as 'not configured', never throws", () => {
    expect(() => resolveDeliveryFee("250.00", { ...branchPin, settings: { deliveryPricing: { slabs: "oops" } } }, nearPin)).not.toThrow();
    expect(resolveDeliveryFee("250.00", { ...branchPin, settings: { deliveryPricing: { slabs: "oops" } } }, nearPin).fee).toBe("250.00");
  });
});
