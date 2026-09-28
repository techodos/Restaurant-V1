import { describe, expect, it } from "vitest";
import {
  decodeTray,
  emptyTray,
  encodeTray,
  MAX_TRAY_LINES,
  TRAY_COOKIE_MAX_CHARS,
  trayCookieName,
  trayFitsCookie,
  trayItemCount,
  type Tray,
} from "@/shared/tray";

/**
 * The tray cookie (`shared/tray.ts`) is the whole cart before an order exists. It is user-controlled, so
 * decoding must never throw and must drop anything malformed; encoding must stay cookie-safe and small.
 */

const ITEM = "11111111-1111-4111-8111-111111111111";
const VARIANT = "22222222-2222-4222-8222-222222222222";
const ADDON_A = "33333333-3333-4333-8333-333333333333";
const ADDON_B = "44444444-4444-4444-8444-444444444444";
const LOCATION = "55555555-5555-4555-8555-555555555555";

const tray: Tray = {
  orderType: "dine_in",
  locationId: LOCATION,
  couponCode: "WELCOME10",
  lines: [
    { menuItemId: ITEM, variantId: VARIANT, quantity: 2, addons: [{ addonId: ADDON_A, quantity: 1 }, { addonId: ADDON_B, quantity: 3 }], specialInstructions: "No onions, extra spicy — شكرا" },
    { menuItemId: ITEM, variantId: null, quantity: 1, addons: [] },
  ],
};

describe("tray cookie codec", () => {
  it("round-trips every field, including unicode notes", () => {
    expect(decodeTray(encodeTray(tray), "delivery")).toEqual(tray);
  });

  it("encodes to cookie-safe characters only (no ; , space, quotes or backslash; nothing to percent-encode)", () => {
    expect(encodeTray(tray)).toMatch(/^[A-Za-z0-9!._*~,\-]+$/);
  });

  it("is compact: a plain line costs well under 50 characters", () => {
    const one = encodeTray({ ...emptyTray("pickup"), lines: [{ menuItemId: ITEM, variantId: null, quantity: 1, addons: [] }] });
    const two = encodeTray({
      ...emptyTray("pickup"),
      lines: [
        { menuItemId: ITEM, variantId: null, quantity: 1, addons: [] },
        { menuItemId: ITEM, variantId: null, quantity: 1, addons: [] },
      ],
    });
    expect(two.length - one.length).toBeLessThan(50);
  });

  it("falls back to an empty tray for missing, foreign or old-format values", () => {
    for (const value of [null, undefined, "", "garbage", "v0!pickup!_!_!", '{"lines":[]}', "v1!pickup!_!_"]) {
      expect(decodeTray(value, "delivery")).toEqual(emptyTray("delivery"));
    }
  });

  it("drops malformed lines and add-ons instead of throwing, and clamps quantities", () => {
    const hex = (uuid: string) => uuid.replace(/-/g, "");
    const raw = [
      "v1",
      "teleport", // unknown order type → default
      "not-hex",
      "%%%",
      [
        `${hex(ITEM)}._.500.${hex(ADDON_A)}~99,zz~1._`, // qty clamped to 99, addon qty to 20, bad addon dropped
        `nothex._.1._._`, // bad item id: dropped
        `${hex(ITEM)}.bad.1._._`, // bad variant id: dropped (never silently turned into "no variant")
        `${hex(ITEM)}._.-4._._`, // negative quantity → 1
      ].join("*"),
    ].join("!");
    const decoded = decodeTray(raw, "pickup");
    expect(decoded.orderType).toBe("pickup");
    expect(decoded.locationId).toBeNull();
    expect(decoded.lines).toEqual([
      { menuItemId: ITEM, variantId: null, quantity: 99, addons: [{ addonId: ADDON_A, quantity: 20 }] },
      { menuItemId: ITEM, variantId: null, quantity: 1, addons: [] },
    ]);
  });

  it("never decodes more than MAX_TRAY_LINES lines", () => {
    const many: Tray = { ...emptyTray("pickup"), lines: Array.from({ length: MAX_TRAY_LINES + 10 }, () => ({ menuItemId: ITEM, variantId: null, quantity: 1, addons: [] })) };
    expect(decodeTray(encodeTray(many), "pickup").lines).toHaveLength(MAX_TRAY_LINES);
  });

  it("knows when a tray no longer fits in one cookie", () => {
    expect(trayFitsCookie(tray)).toBe(true);
    const heavy: Tray = {
      ...emptyTray("pickup"),
      lines: Array.from({ length: 40 }, () => ({
        menuItemId: ITEM,
        variantId: VARIANT,
        quantity: 1,
        addons: [{ addonId: ADDON_A, quantity: 1 }, { addonId: ADDON_B, quantity: 1 }],
        specialInstructions: "x".repeat(140),
      })),
    };
    expect(encodeTray(heavy).length).toBeGreaterThan(TRAY_COOKIE_MAX_CHARS);
    expect(trayFitsCookie(heavy)).toBe(false);
  });

  it("names the cookie per restaurant with only cookie-safe characters", () => {
    expect(trayCookieName("bella-napoli")).toBe("rp_tray_bella-napoli");
    expect(trayCookieName("we;ird slug=")).toBe("rp_tray_weirdslug");
  });

  it("counts items across lines", () => {
    expect(trayItemCount(tray)).toBe(3);
  });
});
