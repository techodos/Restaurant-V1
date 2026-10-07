import { describe, expect, it } from "vitest";
import { rankBranches } from "@/server/services/branching";
import {
  branchesFor,
  decodeDestination,
  destinationCookieName,
  encodeDestination,
  formatDistance,
  normaliseDestination,
  type DeliveryDestination,
} from "@/shared/branching";
import { restaurantFeaturesSchema } from "@/shared/contract/settings";
import type { DeliveryZone, RestaurantLocation } from "@/shared/contract/models";

/**
 * Multi-branch ordering (`features.BranchingFeature`). The rule under test: a branch serves a
 * DESTINATION when one of its own delivery zones matches the address — the same check the order
 * transaction makes — and distance from the destination only orders the list.
 */

const branch = (id: string, name: string, city: string, latitude: number | null, longitude: number | null, isActive = true) =>
  ({ id, name, city, addressLine1: `${name} road`, area: null, latitude, longitude, isActive }) as unknown as RestaurantLocation;

const zone = (locationId: string, areas: string[], postalCodes: string[] = [], isActive = true) =>
  ({ id: `z-${locationId}-${areas.join("")}`, locationId, name: areas.join("/"), areas, postalCodes, isActive }) as unknown as DeliveryZone;

// Lahore: DHA (south-east), Gulberg (centre), Johar Town (south-west). Karachi: Clifton.
const DHA = branch("dha", "DHA Lahore", "Lahore", 31.4697, 74.4084);
const GULBERG = branch("gulberg", "Gulberg Lahore", "Lahore", 31.5204, 74.3587);
const JOHAR = branch("johar", "Johar Town Lahore", "Lahore", 31.4697, 74.2728);
const CLIFTON = branch("clifton", "Clifton Karachi", "Karachi", 24.8138, 67.0299);
const CLOSED = branch("closed", "Closed Lahore", "Lahore", 31.47, 74.4, false);
const LOCATIONS = [GULBERG, DHA, JOHAR, CLIFTON, CLOSED];

const ZONES = [
  zone("dha", ["DHA"]),
  zone("gulberg", ["Gulberg", "DHA"]), // Gulberg also rides out to DHA
  zone("johar", ["Johar Town"]),
  zone("clifton", ["Clifton", "Defence"]),
  zone("closed", ["DHA"]),
];

const destination = (area: string, city: string, latitude: number | null = null, longitude: number | null = null): DeliveryDestination => ({
  label: `${area}, ${city}`,
  line1: "",
  area,
  city,
  postalCode: "",
  latitude,
  longitude,
  addressId: null,
});

describe("which branches serve a destination", () => {
  it("offers only branches whose own zone covers the address, nearest to the destination first", () => {
    const { delivery } = rankBranches(LOCATIONS, ZONES, destination("DHA Phase 5", "Lahore", 31.4625, 74.409));
    expect(delivery.map((option) => option.id)).toEqual(["dha", "gulberg"]);
    expect(delivery[0]!.distanceKm!).toBeLessThan(delivery[1]!.distanceKm!);
    expect(delivery[0]!.distanceKm!).toBeLessThan(2);
  });

  it("is decided by the delivery address, not by where the customer is standing", () => {
    // The customer is in Karachi (their GPS never enters the function at all); the address is in Lahore.
    const { delivery } = rankBranches(LOCATIONS, ZONES, destination("Gulberg III", "Lahore", 31.5102, 74.3441));
    expect(delivery.map((option) => option.id)).toEqual(["gulberg"]);
    expect(delivery.some((option) => option.city === "Karachi")).toBe(false);
  });

  it("returns no branch for an address nobody delivers to, and never an inactive branch", () => {
    expect(rankBranches(LOCATIONS, ZONES, destination("Saddar", "Rawalpindi", 33.5973, 73.0479)).delivery).toEqual([]);
    const dha = rankBranches(LOCATIONS, ZONES, destination("DHA", "Lahore", 31.47, 74.4));
    expect(dha.delivery.some((option) => option.id === "closed")).toBe(false);
    expect(dha.all.some((option) => option.id === "closed")).toBe(false);
  });

  it("ignores an inactive zone", () => {
    const zones = [zone("dha", ["DHA"], [], false), zone("gulberg", ["DHA"])];
    expect(rankBranches(LOCATIONS, zones, destination("DHA", "Lahore")).delivery.map((option) => option.id)).toEqual(["gulberg"]);
  });

  it("matches a postal code as the order does", () => {
    const zones = [zone("johar", [], ["54782"])];
    const typed = { ...destination("", "Lahore"), postalCode: "54782" };
    expect(rankBranches(LOCATIONS, zones, typed).delivery.map((option) => option.id)).toEqual(["johar"]);
  });

  it("still lists serviceable branches for a typed address without coordinates, in display order and without distances", () => {
    const { delivery } = rankBranches(LOCATIONS, ZONES, destination("DHA", "Lahore"));
    expect(delivery.map((option) => option.id)).toEqual(["gulberg", "dha"]);
    expect(delivery.every((option) => option.distanceKm === null)).toBe(true);
  });

  it("offers nothing for delivery before a destination exists; pickup can choose any active branch", () => {
    const state = rankBranches(LOCATIONS, ZONES, null);
    expect(state.delivery).toEqual([]);
    expect(state.all.map((option) => option.id)).toEqual(["gulberg", "dha", "johar", "clifton"]);
    expect(branchesFor(state, "delivery")).toEqual([]);
    expect(branchesFor(state, "pickup")).toHaveLength(4);
  });

  it("orders every branch by distance for pickup once a location is known", () => {
    const { all } = rankBranches(LOCATIONS, ZONES, destination("Clifton", "Karachi", 24.82, 67.03));
    expect(all[0]!.id).toBe("clifton");
    const distances = all.map((option) => option.distanceKm!);
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);
  });
});

describe("the destination cookie", () => {
  it("round-trips, including non-ASCII place names", () => {
    const place = { ...destination("گلبرگ", "Lahore", 31.5, 74.3), line1: "12-B, Main Blvd", addressId: "a1" };
    expect(decodeDestination(encodeDestination(place))).toEqual(place);
    expect(encodeDestination(place)).toMatch(/^[A-Za-z0-9%._~!*'()-]+$/); // cookie-safe
  });

  it("treats anything missing, tampered or place-less as no destination", () => {
    for (const bad of [null, undefined, "", "not json", "%7B", encodeURIComponent("[]"), encodeURIComponent(JSON.stringify({ label: "x" }))]) {
      expect(decodeDestination(bad)).toBeNull();
    }
  });

  it("drops half a coordinate pair and out-of-range values, and caps lengths", () => {
    expect(normaliseDestination({ city: "Lahore", latitude: 31.5 })).toMatchObject({ latitude: null, longitude: null });
    expect(normaliseDestination({ city: "Lahore", latitude: 131, longitude: 74 })).toMatchObject({ latitude: null, longitude: null });
    expect(normaliseDestination({ city: "L".repeat(500) })!.city).toHaveLength(120);
    expect(normaliseDestination({ area: "DHA", city: "Lahore" })!.label).toBe("DHA, Lahore");
  });

  it("names the cookie per restaurant with a safe slug", () => {
    expect(destinationCookieName("zaytoun")).toBe("rp_dest_zaytoun");
    expect(destinationCookieName("we;ird slug=")).toBe("rp_dest_weirdslug");
  });
});

describe("the feature flag", () => {
  it("is off unless restaurants.features says otherwise, and never disturbs the other flags", () => {
    expect(restaurantFeaturesSchema.parse({}).BranchingFeature).toBe(false);
    expect(restaurantFeaturesSchema.parse({ delivery: false }).BranchingFeature).toBe(false);
    // the admin save merges the patch into the stored object before parsing (services/restaurants.ts)
    const merged = restaurantFeaturesSchema.parse({ ...restaurantFeaturesSchema.parse({ delivery: false, loyalty: true }), BranchingFeature: true });
    expect(merged).toMatchObject({ BranchingFeature: true, delivery: false, loyalty: true });
  });
});

describe("distance labels", () => {
  it("shows metres under a kilometre and one decimal above", () => {
    expect(formatDistance(null)).toBe("");
    expect(formatDistance(0.42)).toBe("400 m");
    expect(formatDistance(2.44)).toBe("2.4 km");
  });
});

/**
 * 2026-10-07 bug: "Bahria Town, Lahore" was served by Zaytoun's Gulberg Greens (ISLAMABAD), because that
 * branch has a zone listing "Bahria Town" (Islamabad's) and zone areas were matched as plain text with no
 * city. Fixtures below are the real Zaytoun data. The city is now a hard boundary (deliveries.ts#servingZones).
 */
describe("city is a hard boundary for delivery branches", () => {
  const F7 = branch("f7", "F-7 Markaz", "Islamabad", 33.7215, 73.0563);
  const GREENS = branch("greens", "Gulberg Greens", "Islamabad", 33.6069, 73.1728);
  const MALL1 = branch("mall1", "Mall 1", "Lahore", null, null);
  const BAHRIA_LHR = branch("bahria-lhr", "Bahria Town Lahore", "Lahore", 31.3656, 74.1858);
  const JOHAR_LHR = branch("johar-lhr", "Johar Town Lahore", "Lahore", 31.4697, 74.2728);
  const ZAYTOUN = [F7, GREENS, MALL1];
  const ZAYTOUN_ZONES = [
    zone("f7", ["F-6", "F-7", "F-8", "Jinnah Super"]),
    zone("greens", ["Gulberg Greens", "Gulberg Residencia", "Islamabad Expressway"]),
    zone("greens", ["Bahria Town", "DHA Phase 2", "DHA Phase 5", "Park Road"], ["46220", "44000"]),
    zone("mall1", ["Gulberg", "Walton", "DHA", "FCC OLD", "Cavalry Ground"]),
  ];
  const ids = (options: { id: string }[]) => options.map((option) => option.id);

  it("Scenario 1: Bahria Town, Lahore is NOT served by Islamabad's Gulberg Greens", () => {
    // with only the real data, no Lahore branch covers Bahria Town: ordering unavailable, no branch at all
    expect(ids(rankBranches(ZAYTOUN, ZAYTOUN_ZONES, destination("Bahria Town", "Lahore", 31.3656, 74.1858)).delivery)).toEqual([]);
    // add a Lahore branch that does cover it: that one, and only that one
    const withLahore = rankBranches([...ZAYTOUN, BAHRIA_LHR], [...ZAYTOUN_ZONES, zone("bahria-lhr", ["Bahria Town"])], destination("Bahria Town", "Lahore", 31.37, 74.19));
    expect(ids(withLahore.delivery)).toEqual(["bahria-lhr"]);
  });

  it("Scenario 2: Islamabad's Bahria Town is served by Gulberg Greens", () => {
    expect(ids(rankBranches(ZAYTOUN, ZAYTOUN_ZONES, destination("Bahria Town", "Islamabad", 33.53, 73.15)).delivery)).toEqual(["greens"]);
  });

  it("works the other way round too: Lahore's 'Gulberg'/'DHA' zones never serve Islamabad", () => {
    expect(ids(rankBranches(ZAYTOUN, ZAYTOUN_ZONES, destination("Gulberg Greens", "Islamabad", 33.6, 73.17)).delivery)).toEqual(["greens"]);
    expect(ids(rankBranches(ZAYTOUN, ZAYTOUN_ZONES, destination("DHA Phase 5", "Islamabad", 33.5, 73.16)).delivery)).toEqual(["greens"]);
    expect(ids(rankBranches(ZAYTOUN, ZAYTOUN_ZONES, destination("DHA", "Lahore", 31.47, 74.4)).delivery)).toEqual(["mall1"]);
  });

  it("Scenario 3: a city with no branch gets no branch (no nearest/first fallback), and the served cities are listed", () => {
    const karachi = rankBranches(ZAYTOUN, ZAYTOUN_ZONES, destination("Clifton", "Karachi", 24.81, 67.03));
    expect(karachi.delivery).toEqual([]);
    expect(karachi.deliveryCities).toEqual(["Islamabad", "Lahore"]);
  });

  it("Scenario 4: several branches in the city — only those, nearest first", () => {
    const branches = [...ZAYTOUN, BAHRIA_LHR, JOHAR_LHR];
    const zones = [...ZAYTOUN_ZONES, zone("bahria-lhr", ["Bahria Town", "Johar Town"]), zone("johar-lhr", ["Johar Town", "Bahria Town"])];
    const result = rankBranches(branches, zones, destination("Bahria Town", "Lahore", 31.37, 74.19));
    expect(ids(result.delivery)).toEqual(["bahria-lhr", "johar-lhr"]); // never "greens"
  });

  it("Scenarios 5-7: every location change is ranked from scratch (Lahore -> Islamabad -> Lahore)", () => {
    const branches = [...ZAYTOUN, BAHRIA_LHR];
    const zones = [...ZAYTOUN_ZONES, zone("bahria-lhr", ["Bahria Town"])];
    const lahore = () => ids(rankBranches(branches, zones, destination("Bahria Town", "Lahore", 31.37, 74.19)).delivery);
    const islamabad = () => ids(rankBranches(branches, zones, destination("Bahria Town", "Islamabad", 33.53, 73.15)).delivery);
    expect([lahore(), islamabad(), lahore(), islamabad()]).toEqual([["bahria-lhr"], ["greens"], ["bahria-lhr"], ["greens"]]);
  });

  it("an address without a city, or a branch without one, cannot be matched", () => {
    expect(rankBranches(ZAYTOUN, ZAYTOUN_ZONES, destination("Bahria Town", "")).delivery).toEqual([]);
    const noCity = branch("nocity", "No city", "", 31.5, 74.3);
    expect(rankBranches([noCity], [zone("nocity", ["Bahria Town"])], destination("Bahria Town", "Lahore")).delivery).toEqual([]);
  });

  it("compares cities loosely (case, spacing) but never by name guessing", () => {
    expect(ids(rankBranches(ZAYTOUN, ZAYTOUN_ZONES, destination("Bahria Town", "  islamabad ")).delivery)).toEqual(["greens"]);
  });
});
