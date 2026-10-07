import { describe, expect, it } from "vitest";
import { haversineKm, pointInPolygon, polygonProblem, toPolygon, type Polygon } from "@/shared/geo";
import { servingZones, type ZoneBranch } from "@/server/repositories/deliveries";
import { deliveryZoneSchema } from "@/server/validation/delivery-zones";
import { rankBranches } from "@/server/services/branching";
import type { DeliveryZone, RestaurantLocation } from "@/shared/contract/models";
import type { DeliveryDestination } from "@/shared/branching";

/**
 * Map delivery zones (migration 0030): a radius around the branch, or a drawn polygon, decided by the
 * customer's pin — with the city still a hard boundary and area names as the no-pin fallback. DB-free.
 */

// a ~2 km square around Gulberg, Lahore (lat, lng)
const GULBERG_SQUARE: Polygon = [
  [31.50, 74.33],
  [31.50, 74.35],
  [31.52, 74.35],
  [31.52, 74.33],
];
const pin = (latitude: number, longitude: number) => ({ latitude, longitude });

describe("geometry", () => {
  it("point in polygon: inside, outside, on an edge, on a corner", () => {
    expect(pointInPolygon(pin(31.51, 74.34), GULBERG_SQUARE)).toBe(true);
    expect(pointInPolygon(pin(31.53, 74.34), GULBERG_SQUARE)).toBe(false);
    expect(pointInPolygon(pin(31.50, 74.34), GULBERG_SQUARE)).toBe(true); // on the south edge
    expect(pointInPolygon(pin(31.52, 74.35), GULBERG_SQUARE)).toBe(true); // a corner
    // concave "L" shape: the notch is outside
    const L: Polygon = [[0, 0], [0, 2], [1, 2], [1, 1], [2, 1], [2, 0]];
    expect(pointInPolygon(pin(1.5, 1.5), L)).toBe(false);
    expect(pointInPolygon(pin(0.5, 1.5), L)).toBe(true);
  });

  it("rejects polygons that cannot define an area", () => {
    expect(polygonProblem(GULBERG_SQUARE)).toBeNull();
    expect(polygonProblem([[31.5, 74.3], [31.51, 74.31]])).toMatch(/at least 3/);
    expect(polygonProblem([[31.5, 74.3], [31.51, 74.31], [31.52, 74.32]])).toMatch(/empty/); // all on one line
    // figure-eight: edges cross
    expect(polygonProblem([[31.50, 74.33], [31.52, 74.35], [31.50, 74.35], [31.52, 74.33]])).toMatch(/crosses itself/);
    expect(polygonProblem([[31.5, 74.3], [33.7, 73.0], [24.8, 67.0]])).toMatch(/too large/); // Lahore–Islamabad–Karachi
  });

  it("reads stored JSON tolerantly", () => {
    expect(toPolygon(GULBERG_SQUARE)).toEqual(GULBERG_SQUARE);
    expect(toPolygon(null)).toBeNull();
    expect(toPolygon("nope")).toBeNull();
    expect(toPolygon([[1, 2], [3]])).toBeNull();
    expect(toPolygon([[1, 2], [3, 4], [200, 4]])).toBeNull(); // latitude out of range
  });
});

const zone = (id: string, locationId: string, extra: Partial<DeliveryZone> = {}) =>
  ({ id, locationId, name: id, areas: [], postalCodes: [], isActive: true, radiusKm: null, polygon: null, ...extra }) as unknown as DeliveryZone;
const BRANCHES: Record<string, ZoneBranch> = {
  gulberg: { city: "Lahore", latitude: 31.51, longitude: 74.34 },
  greens: { city: "Islamabad", latitude: 33.6069, longitude: 73.1728 },
  nopin: { city: "Lahore", latitude: null, longitude: null },
};
const branchOf = (id: string) => BRANCHES[id];
const ids = (zones: DeliveryZone[]) => zones.map((z) => z.id);

describe("coverage rule (servingZones)", () => {
  it("polygon: the pin decides, not the area name", () => {
    const drawn = zone("drawn", "gulberg", { polygon: GULBERG_SQUARE, areas: ["Gulberg"] });
    expect(ids(servingZones([drawn], { area: "Somewhere", city: "Lahore", latitude: 31.51, longitude: 74.34 }, branchOf))).toEqual(["drawn"]);
    // the name matches but the pin is outside the drawn area: NOT served (geometry is not widened by names)
    expect(ids(servingZones([drawn], { area: "Gulberg", city: "Lahore", latitude: 31.6, longitude: 74.4 }, branchOf))).toEqual([]);
  });

  it("radius: measured from the branch pin, inclusive", () => {
    const ring = zone("ring", "gulberg", { radiusKm: 3 });
    const near = { latitude: 31.53, longitude: 74.34 }; // ~2.2 km
    const far = { latitude: 31.56, longitude: 74.34 }; // ~5.6 km
    expect(haversineKm(near, BRANCHES.gulberg as { latitude: number; longitude: number })).toBeLessThan(3);
    expect(ids(servingZones([ring], { area: "x", city: "Lahore", ...near }, branchOf))).toEqual(["ring"]);
    expect(ids(servingZones([ring], { area: "x", city: "Lahore", ...far }, branchOf))).toEqual([]);
  });

  it("radius on a branch without a pin cannot be measured: not served", () => {
    expect(servingZones([zone("r", "nopin", { radiusKm: 50 })], { area: "x", city: "Lahore", latitude: 31.5, longitude: 74.3 }, branchOf)).toEqual([]);
  });

  it("no pin (typed address): a map zone falls back to its area names, and serves nothing without them", () => {
    const withNames = zone("named", "gulberg", { polygon: GULBERG_SQUARE, areas: ["Gulberg"] });
    const withoutNames = zone("bare", "gulberg", { polygon: GULBERG_SQUARE });
    expect(ids(servingZones([withNames, withoutNames], { area: "Gulberg III", city: "Lahore" }, branchOf))).toEqual(["named"]);
  });

  it("the city stays a hard boundary even when a pin lands inside another city's shape", () => {
    // a Lahore address whose (bad) pin sits inside an Islamabad zone: refused
    const isb = zone("isb", "greens", { radiusKm: 100 });
    expect(servingZones([isb], { area: "Bahria Town", city: "Lahore", latitude: 33.6, longitude: 73.17 }, branchOf)).toEqual([]);
  });

  it("names-only zones behave exactly as before", () => {
    const named = zone("named", "gulberg", { areas: ["DHA"] });
    expect(ids(servingZones([named], { area: "DHA Phase 5", city: "Lahore", latitude: 0, longitude: 0 }, branchOf))).toEqual(["named"]);
  });

  it("branch ranking uses the destination pin the same way", () => {
    const location = (id: string, city: string, latitude: number | null, longitude: number | null) =>
      ({ id, name: id, city, latitude, longitude, isActive: true, addressLine1: null, area: null }) as unknown as RestaurantLocation;
    const destination = (latitude: number | null, longitude: number | null): DeliveryDestination => ({
      label: "Somewhere, Lahore", line1: "", area: "Somewhere", city: "Lahore", postalCode: "", latitude, longitude, addressId: null,
    });
    const branches = [location("gulberg", "Lahore", 31.51, 74.34)];
    const zones = [zone("drawn", "gulberg", { polygon: GULBERG_SQUARE })];
    expect(rankBranches(branches, zones, destination(31.51, 74.34)).delivery.map((b) => b.id)).toEqual(["gulberg"]);
    expect(rankBranches(branches, zones, destination(31.60, 74.40)).delivery).toEqual([]);
    expect(rankBranches(branches, zones, destination(null, null)).delivery).toEqual([]); // no pin, no names
  });
});

describe("zone form validation", () => {
  const base = { locationId: "11111111-1111-4111-8111-111111111111", name: "Z", deliveryFee: "150" };
  it("needs the input its coverage mode uses", () => {
    expect(deliveryZoneSchema.safeParse({ ...base, coverage: "areas" }).success).toBe(false); // no names
    expect(deliveryZoneSchema.safeParse({ ...base, coverage: "areas", areas: ["DHA"] }).success).toBe(true);
    expect(deliveryZoneSchema.safeParse({ ...base, coverage: "radius" }).success).toBe(false);
    expect(deliveryZoneSchema.safeParse({ ...base, coverage: "radius", radiusKm: 4 }).success).toBe(true);
    expect(deliveryZoneSchema.safeParse({ ...base, coverage: "radius", radiusKm: 500 }).success).toBe(false);
    expect(deliveryZoneSchema.safeParse({ ...base, coverage: "polygon", polygon: GULBERG_SQUARE }).success).toBe(true);
    const crossing = deliveryZoneSchema.safeParse({ ...base, coverage: "polygon", polygon: [[31.50, 74.33], [31.52, 74.35], [31.50, 74.35], [31.52, 74.33]] });
    expect(crossing.success).toBe(false);
  });

  it("keeps old clients working: no coverage = area names", () => {
    expect(deliveryZoneSchema.parse({ ...base, areas: ["DHA"] }).coverage).toBe("areas");
  });
});
