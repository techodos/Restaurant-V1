import { describe, expect, it } from "vitest";
import { rankBranches } from "@/server/services/branching";
import {
  branchCities,
  branchesFor,
  inCustomerCity,
  listCities,
  sameCity,
  decodeDestination,
  destinationCookieName,
  encodeDestination,
  formatDistance,
  normaliseDestination,
  orderBranchId,
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
    const state = { ...rankBranches(LOCATIONS, ZONES, null), destination: null };
    expect(state.delivery).toEqual([]);
    expect(state.all.map((option) => option.id)).toEqual(["gulberg", "dha", "johar", "clifton"]);
    expect(branchesFor(state, "delivery")).toEqual([]);
    expect(branchesFor(state, "pickup")).toHaveLength(4);
  });

  it("pickup / dine-in only from a branch in the customer's city once a location is chosen (owner decision 2026-10-27)", () => {
    const at = (city: string) => ({ ...rankBranches(LOCATIONS, ZONES, destination("Somewhere", city)), destination: destination("Somewhere", city) });
    // Karachi customer: the Karachi branch only, for pickup and dine-in alike
    expect(branchesFor(at("Karachi"), "pickup").map((option) => option.id)).toEqual(["clifton"]);
    expect(branchesFor(at(" karachi "), "dine_in").map((option) => option.id)).toEqual(["clifton"]);
    // a city with no branch: nothing (the storefront says "no branch in Peshawar yet", createOrder refuses)
    expect(branchesFor(at("Peshawar"), "pickup")).toEqual([]);
    // cities with a branch, for that message
    expect(listCities(branchCities(at("Peshawar")))).toBe("Lahore and Karachi");
  });

  it("never hides a branch whose city is unknown, and treats an unknown customer city as 'any branch'", () => {
    expect(inCustomerCity({ city: null }, "Karachi")).toBe(true);
    expect(inCustomerCity({ city: "Lahore" }, "")).toBe(true);
    expect(inCustomerCity({ city: "Lahore" }, "Karachi")).toBe(false);
    expect(sameCity("Lahore", " LAHORE ")).toBe(true);
    expect(sameCity("", "")).toBe(false);
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

describe("deliveryAreas: the location sheet's city / area dropdowns", () => {
  const lahoreA = branch("lhr-a", "Lahore A", "Lahore", 31.5, 74.3);
  const lahoreB = branch("lhr-b", "Lahore B", " lahore ", 31.4, 74.4);
  const karachi = branch("khi", "Karachi", "Karachi", 24.8, 67.0);
  const off = branch("off", "Closed Lahore", "Lahore", 31.47, 74.4, false);
  const zones = [
    zone("lhr-a", ["Gulberg", " DHA Phase 5 ", "Lahore"]),
    zone("lhr-b", ["dha phase 5", "Bahria Town"]),
    zone("lhr-b", ["Johar Town"], [], false),
    zone("off", ["Model Town"]),
    zone("khi", ["Clifton"]),
  ];

  it("lists each delivery city's zone areas: de-duplicated, sorted, without the city itself, inactive zones and branches ignored", () => {
    const { deliveryAreas } = rankBranches([lahoreA, lahoreB, karachi, off], zones, null);
    expect(deliveryAreas).toEqual([
      { city: "Lahore", areas: ["Bahria Town", "DHA Phase 5", "Gulberg"] },
      { city: "Karachi", areas: ["Clifton"] },
    ]);
  });

  it("is the same with or without a destination", () => {
    const withDestination = rankBranches([lahoreA, karachi], zones, destination("Gulberg", "Lahore", 31.5, 74.3));
    expect(withDestination.deliveryAreas).toEqual(rankBranches([lahoreA, karachi], zones, null).deliveryAreas);
  });
});

describe("the branch an order belongs to (orderBranchId)", () => {
  it("multi-branch ordering on: the branch the customer chose, never silently another", () => {
    expect(orderBranchId(true, "mall-1", "walton")).toBe("mall-1");
    // no choice yet stays no choice: checkout redirects to the menu and createOrder refuses it
    expect(orderBranchId(true, null, "walton")).toBeNull();
  });

  it("off (single-branch mode): always the primary branch, so no branch has to be chosen", () => {
    expect(orderBranchId(false, null, "walton")).toBe("walton");
  });

  it("off: a branch left in the cookie from when the flag was on (or edited) cannot move the order", () => {
    expect(orderBranchId(false, "mall-1", "walton")).toBe("walton");
  });

  it("off with no active location configured: null (createOrder records the serving zone's branch)", () => {
    expect(orderBranchId(false, "mall-1", null)).toBeNull();
  });
});
