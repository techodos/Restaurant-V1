import { describe, expect, it } from "vitest";
import { assignableRoles, can, isSuperAdmin } from "@/server/auth/permissions";
import { effectiveOnlineProvider, entitledPaymentMethods, entitlementForPermission, isEntitled, parseEntitlements, resolveFeatures } from "@/shared/feature-access";

describe("entitlements", () => {
  it("allows everything when the column is empty or malformed", () => {
    for (const raw of [{}, null, "x", []]) expect(Object.values(parseEntitlements(raw)).every(Boolean)).toBe(true);
    expect(resolveFeatures({ coupons: true }, {}).features.coupons).toBe(true);
  });

  it("forces a platform-disabled feature off even when the owner has it on", () => {
    const { features, ownerFeatures } = resolveFeatures({ BranchingFeature: true, coupons: true }, { BranchingFeature: false });
    expect(features.BranchingFeature).toBe(false);
    expect(ownerFeatures.BranchingFeature).toBe(true); // the owner's stored choice is kept for when it is re-allowed
    expect(features.coupons).toBe(true);
  });

  it("drops payment methods the platform has not allowed", () => {
    const entitlements = parseEntitlements({ pay_card_online: false });
    expect(entitledPaymentMethods(["cash", "card_online", "wallet"], entitlements)).toEqual(["cash", "wallet"]);
    expect(entitlementForPermission("payments.view")).toBe("payments"); // the screen switch is unrelated to method keys
  });

  it("treats a platform-disallowed online provider as none", () => {
    const entitlements = parseEntitlements({ provider_stripe: false });
    expect(effectiveOnlineProvider("stripe", entitlements)).toBe("none");
    expect(effectiveOnlineProvider("jazzcash", entitlements)).toBe("jazzcash");
    expect(effectiveOnlineProvider("none", parseEntitlements({}))).toBe("none");
  });

  it("never turns a feature on that the owner has off", () => {
    expect(resolveFeatures({ coupons: false }, { coupons: true }).features.coupons).toBe(false);
  });

  it("gates notification channels and keeps alaCarteEnabled out of entitlements", () => {
    const { features } = resolveFeatures({ alaCarteEnabled: false }, { pushNotify: false, emailNotify: true });
    expect(features.notificationChannels).toEqual({ emailNotify: true, pushNotify: false });
    expect(features.alaCarteEnabled).toBe(false);
    expect(isEntitled(parseEntitlements({}), "alaCarteEnabled")).toBe(true);
  });

  it("maps permissions to the entitlement behind their screen", () => {
    expect(entitlementForPermission("coupons.view")).toBe("coupons");
    expect(entitlementForPermission("kitchen.view")).toBe("kitchen");
    expect(entitlementForPermission("staff.manage")).toBe("staff");
    expect(entitlementForPermission("orders.view")).toBeUndefined();
    expect(entitlementForPermission("settings.view")).toBeUndefined();
  });
});

describe("super_admin role", () => {
  it("has owner-level permissions but nobody can assign it", () => {
    expect(isSuperAdmin("super_admin")).toBe(true);
    expect(isSuperAdmin("owner")).toBe(false);
    expect(can({ role: "super_admin" }, "settings.manage")).toBe(true);
    for (const role of ["super_admin", "owner", "admin", "manager", "staff"] as const) {
      expect(assignableRoles(role)).not.toContain("super_admin");
    }
  });
});
