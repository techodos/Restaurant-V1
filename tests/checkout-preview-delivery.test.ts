import { describe, expect, it, vi } from "vitest";

// the preview's only other dependency (a coupon on the tray); none here
vi.mock("@/server/services/catalog", () => ({ getOrderableMenuItems: vi.fn() }));
vi.mock("@/server/services/coupons", () => ({ findPreviewCoupon: vi.fn(async () => null) }));

import { priceTray, zoneBranchLookup, type TrayView } from "@/server/services/cart";
import type { DeliveryZone, Restaurant, RestaurantLocation } from "@/shared/contract/models";
import { restaurantFeaturesSchema, restaurantSettingsSchema } from "@/shared/contract/settings";

/**
 * The checkout preview prices delivery the way createOrder charges it (2026-10-27): the zone that covers the address
 * (not the branch's FIRST zone) and, with a map pin and per-branch distance pricing, the distance slab's fee. Before,
 * a customer in a dearer zone saw the cheaper zone's fee on "Place order" and was charged the other. DB-free.
 */
const BRANCH = "b1";
const restaurant = { id: "r1", settings: restaurantSettingsSchema.parse({}), features: restaurantFeaturesSchema.parse({}) } as unknown as Restaurant;
const zone = (id: string, areas: string[], fee: string) =>
  ({ id, restaurantId: "r1", locationId: BRANCH, name: id, description: null, areas, postalCodes: [], deliveryFee: fee, minOrderAmount: "0.00", freeDeliveryOver: null, etaMinMinutes: 30, etaMaxMinutes: 45, isActive: true, sortOrder: 0, radiusKm: null, polygon: null }) as DeliveryZone;
const ZONES = [zone("gulberg", ["Gulberg"], "150.00"), zone("dha", ["DHA"], "250.00")];
const branch = (settings: unknown = {}) =>
  [{ id: BRANCH, city: "Lahore", latitude: 31.52, longitude: 74.35, settings, isActive: true } as unknown as RestaurantLocation];
const tray = { orderType: "delivery" as const, locationId: BRANCH, couponCode: null, lines: [] };
const view: TrayView = {
  lines: [{ index: 0, line: { menuItemId: "m1", variantId: null, quantity: 1, addons: [] }, name: "Grill", slug: null, imageUrl: null, variantName: null, addons: [], unitPrice: "1000.00", addonsTotal: "0.00", lineTotal: "1000.00", problem: null }],
  itemCount: 1,
  subtotal: "1000.00",
};

describe("checkout preview: delivery fee for the customer's own address", () => {
  it("without an address it can only preview the branch's first zone (the old, misleading figure)", async () => {
    const result = await priceTray(restaurant, tray, view, { zones: ZONES });
    expect(result.pricing?.deliveryFee).toBe("150.00");
  });

  it("with the address, the zone that covers it — what the order will charge", async () => {
    const result = await priceTray(restaurant, tray, view, { zones: ZONES, address: { area: "DHA", city: "Lahore" }, branchOf: zoneBranchLookup(branch()) });
    expect(result.pricing?.deliveryFee).toBe("250.00");
  });

  it("with a map pin and distance pricing on the branch, the distance slab's fee", async () => {
    const pricing = { deliveryPricing: { slabs: [{ maxKm: 3, fee: 100 }, { maxKm: 20, fee: 300 }] } };
    const pin = { area: "DHA", city: "Lahore", latitude: 31.47, longitude: 74.41 }; // ~8 km from the branch
    const result = await priceTray(restaurant, tray, view, { zones: ZONES, address: pin, branchOf: zoneBranchLookup(branch(pricing)) });
    expect(result.pricing?.deliveryFee).toBe("300.00");
  });

  it("an address no zone covers is not priced as if it were served", async () => {
    const result = await priceTray(restaurant, tray, view, { zones: ZONES, address: { area: "Bahria Town", city: "Karachi" }, branchOf: zoneBranchLookup(branch()) });
    expect(result.pricing).toBeNull();
  });
});
