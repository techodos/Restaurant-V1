import { describe, expect, it } from "vitest";
import { matchDeliveryZone, sameCity, servingZones } from "@/server/repositories/deliveries";
import type { DeliveryZone } from "@/shared/contract/models";

/**
 * The order's own coverage check (orders.ts#createOrder uses `servingZones`). Scenarios 8/9: a forged
 * branch/zone from the browser cannot make a Lahore address deliverable from Islamabad.
 */
const zone = (id: string, locationId: string, areas: string[], postalCodes: string[] = []) =>
  ({ id, locationId, name: id, areas, postalCodes, isActive: true }) as unknown as DeliveryZone;
const CITY: Record<string, string> = { greens: "Islamabad", lhr: "Lahore" };
const cityOf = (locationId: string) => ({ city: CITY[locationId] });
const ISB_BAHRIA = zone("isb-bahria", "greens", ["Bahria Town"], ["46220"]);
const LHR_BAHRIA = zone("lhr-bahria", "lhr", ["Bahria Town"]);

describe("order delivery coverage", () => {
  it("only zones of the address's own city serve it, even with the same area name", () => {
    expect(servingZones([ISB_BAHRIA, LHR_BAHRIA], { area: "Bahria Town", city: "Lahore" }, cityOf).map((z) => z.id)).toEqual(["lhr-bahria"]);
    expect(matchDeliveryZone([ISB_BAHRIA], { area: "Bahria Town", city: "Lahore" }, cityOf)).toBeNull();
  });

  it("a postal code of another city's zone does not cross the boundary either", () => {
    expect(matchDeliveryZone([ISB_BAHRIA], { area: "Anywhere", city: "Lahore", postalCode: "46220" }, cityOf)).toBeNull();
    expect(matchDeliveryZone([ISB_BAHRIA], { area: "Anywhere", city: "Islamabad", postalCode: "46220" }, cityOf)?.id).toBe("isb-bahria");
  });

  it("a zone id sent by the browser counts only if that zone serves the address (createOrder's choice)", () => {
    const pick = (zoneId: string, city: string) =>
      servingZones([ISB_BAHRIA, LHR_BAHRIA], { area: "Bahria Town", city }, cityOf).find((z) => z.id === zoneId) ??
      servingZones([ISB_BAHRIA, LHR_BAHRIA], { area: "Bahria Town", city }, cityOf)[0] ??
      null;
    expect(pick("isb-bahria", "Lahore")?.id).toBe("lhr-bahria"); // forged Islamabad zone ignored
    expect(servingZones([ISB_BAHRIA], { area: "Bahria Town", city: "Lahore" }, cityOf)).toEqual([]); // Islamabad branch only: refused
  });

  it("unknown city on either side is never the same city", () => {
    expect(sameCity("", "")).toBe(false);
    expect(sameCity(null, "Lahore")).toBe(false);
    expect(sameCity(" LAHORE", "lahore ")).toBe(true);
  });
});
