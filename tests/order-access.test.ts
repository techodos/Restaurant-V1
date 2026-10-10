import { describe, expect, it } from "vitest";
import { safeReturnTo, signInHref } from "@/shared/return-to";
import { signOrderAccessToken, verifyCustomerSession, verifyOrderAccessToken } from "@/server/auth/tokens";

describe("guest order grant (how a guest's browser sees its own order)", () => {
  const orderId = "7a170002-aaaa-4aaa-8aaa-000000000001";
  const restaurantId = "7a170002-aaaa-4aaa-8aaa-000000000002";

  it("carries the order number so the browser's saved grants match a page without a database read", async () => {
    const token = await signOrderAccessToken({ orderId, restaurantId, orderNumber: "ETEQ-YVYJK" });
    expect(await verifyOrderAccessToken(token)).toEqual({ orderId, restaurantId, orderNumber: "ETEQ-YVYJK" });
  });

  it("still verifies an email-link token signed without an order number", async () => {
    const token = await signOrderAccessToken({ orderId, restaurantId });
    expect(await verifyOrderAccessToken(token)).toEqual({ orderId, restaurantId });
  });

  it("is never accepted as a customer session, and a tampered token is refused", async () => {
    const token = await signOrderAccessToken({ orderId, restaurantId, orderNumber: "ETEQ-YVYJK" });
    expect(await verifyCustomerSession(token)).toBeNull();
    expect(await verifyOrderAccessToken(`${token.slice(0, -2)}xx`)).toBeNull();
  });
});

describe("safeReturnTo", () => {
  it("accepts a path inside this restaurant's storefront", () => {
    expect(safeReturnTo("zaytoun", "/r/zaytoun/checkout")).toBe("/r/zaytoun/checkout");
    expect(safeReturnTo("zaytoun", "/r/zaytoun")).toBe("/r/zaytoun");
  });

  it("rejects open redirects, other tenants and the auth pages themselves", () => {
    for (const bad of [
      "https://evil.example/r/zaytoun/checkout",
      "//evil.example",
      "/r/zaytoun-evil/checkout",
      "/r/bella-napoli/checkout",
      "/r/zaytoun/\\evil",
      "/r/zaytoun/account/sign-in",
      "/r/zaytoun/account/sign-up?returnTo=/r/zaytoun/checkout",
      "/r/zaytoun/account/google-phone",
      "",
      null,
      undefined,
    ]) {
      expect(safeReturnTo("zaytoun", bad)).toBeNull();
    }
  });

  it("builds the sign-in link that returns to checkout", () => {
    expect(signInHref("zaytoun", "/r/zaytoun/checkout")).toBe("/r/zaytoun/account/sign-in?returnTo=%2Fr%2Fzaytoun%2Fcheckout");
    expect(signInHref("zaytoun", "https://evil.example", "sign-up")).toBe("/r/zaytoun/account/sign-up");
    // the header's sign-in: back to whichever page it was clicked on, never back onto the auth page itself
    expect(signInHref("zaytoun", "/r/zaytoun/menu/shawarma")).toBe("/r/zaytoun/account/sign-in?returnTo=%2Fr%2Fzaytoun%2Fmenu%2Fshawarma");
    expect(signInHref("zaytoun", "/r/zaytoun/account/sign-in")).toBe("/r/zaytoun/account/sign-in");
  });
});
