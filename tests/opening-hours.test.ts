import { describe, expect, it } from "vitest";
import { acceptsOrdersAt, isOpenAt, parseOpeningHours } from "@/shared/hours";
import { locationSchema, openingHoursSchema } from "@/server/validation/locations";

const KARACHI = "Asia/Karachi"; // UTC+5, no DST
const at = (iso: string) => new Date(iso);
const threeAm = at("2026-10-09T22:00:00Z"); // Sat 03:00 in Karachi
const sevenPm = at("2026-10-10T14:00:00Z"); // Sat 19:00 in Karachi

describe("ordering vs opening hours", () => {
  it("a branch with no hours set takes orders at any time (it is not 'closed forever')", () => {
    expect(acceptsOrdersAt(parseOpeningHours({}), threeAm, KARACHI)).toBe(true);
    expect(acceptsOrdersAt(parseOpeningHours(null), sevenPm, KARACHI)).toBe(true);
    // reservations still need hours: no hours = no slots
    expect(isOpenAt(parseOpeningHours({}), sevenPm, KARACHI)).toBe(false);
  });

  it("hours that are set are enforced, including 24 hours and windows past midnight", () => {
    const lunchToLate = parseOpeningHours({ sat: [{ open: "12:00", close: "23:00" }] });
    expect(acceptsOrdersAt(lunchToLate, sevenPm, KARACHI)).toBe(true);
    expect(acceptsOrdersAt(lunchToLate, threeAm, KARACHI)).toBe(false);
    expect(acceptsOrdersAt(parseOpeningHours({ sat: [{ open: "00:00", close: "00:00" }] }), threeAm, KARACHI)).toBe(true);
    // Friday 18:00 → 04:00 still serves Saturday 03:00
    expect(acceptsOrdersAt(parseOpeningHours({ fri: [{ open: "18:00", close: "04:00" }] }), threeAm, KARACHI)).toBe(true);
  });
});

describe("branch opening hours form validation", () => {
  it("accepts not set, a split day, 24 hours and closed days", () => {
    expect(openingHoursSchema.safeParse({}).success).toBe(true);
    expect(
      openingHoursSchema.safeParse({
        mon: [{ open: "12:00", close: "15:00" }, { open: "19:00", close: "23:30" }],
        tue: [{ open: "00:00", close: "00:00" }],
        wed: [],
      }).success,
    ).toBe(true);
  });

  it("refuses every day closed, bad times, unknown days and more than three windows", () => {
    expect(openingHoursSchema.safeParse({ mon: [], tue: [] }).success).toBe(false);
    expect(openingHoursSchema.safeParse({ mon: [{ open: "25:00", close: "23:00" }] }).success).toBe(false);
    expect(openingHoursSchema.safeParse({ monday: [{ open: "12:00", close: "23:00" }] }).success).toBe(false);
    const w = { open: "10:00", close: "11:00" };
    expect(openingHoursSchema.safeParse({ mon: [w, w, w, w] }).success).toBe(false);
  });

  it("is optional on the location form (omitted = keep the stored hours)", () => {
    const base = { name: "Mall 1", city: "Lahore" };
    expect(locationSchema.parse(base).hours).toBeUndefined();
    expect(locationSchema.parse({ ...base, hours: { fri: [{ open: "09:00", close: "22:00" }] } }).hours).toEqual({ fri: [{ open: "09:00", close: "22:00" }] });
  });
});

describe("checkout button when the branch is closed", () => {
  it("says Restaurant / Branch closed with the reopening time, and nothing when open or hours not set", async () => {
    const { branchClosedLabel } = await import("@/server/services/cart");
    const restaurant = { timezone: KARACHI } as never;
    const branch = (hours: unknown) => ({ hours: parseOpeningHours(hours) }) as never;
    const lunchToLate = { sat: [{ open: "12:00", close: "23:00" }], sun: [{ open: "12:00", close: "23:00" }] };
    expect(branchClosedLabel(restaurant, branch(lunchToLate), false, threeAm)).toBe("Restaurant closed · opens 12pm");
    expect(branchClosedLabel(restaurant, branch(lunchToLate), true, threeAm)).toBe("Branch closed · opens 12pm");
    expect(branchClosedLabel(restaurant, branch(lunchToLate), true, sevenPm)).toBeNull();
    expect(branchClosedLabel(restaurant, branch({}), true, threeAm)).toBeNull();
  });
});
