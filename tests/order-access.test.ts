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
  it("accepts a storefront path", () => {
    expect(safeReturnTo("/checkout")).toBe("/checkout");
    expect(safeReturnTo("/")).toBe("/");
    expect(safeReturnTo("/menu/shawarma?orderType=pickup")).toBe("/menu/shawarma?orderType=pickup");
  });

  it("rejects open redirects, the admin/API and the auth pages themselves", () => {
    for (const bad of [
      "https://evil.example/checkout",
      "//evil.example",
      "/\\evil.example",
      "/checkout\\evil",
      // browsers strip tab / newline / CR while parsing, so these would become //evil.example
      "/\t/evil.example",
      "/\n/evil.example",
      "/\r/evil.example",
      "/ /evil.example",
      "/\u0000/evil.example",
      "javascript:alert(1)",
      "checkout",
      "/admin",
      "/admin/orders",
      "/super-admin",
      "/api/internal/notifications/dispatch",
      "/account/sign-in",
      "/account/sign-up?returnTo=/checkout",
      "/account/google-phone",
      "",
      null,
      undefined,
    ]) {
      expect(safeReturnTo(bad), String(bad)).toBeNull();
    }
  });

  it("builds the sign-in link that returns to checkout", () => {
    expect(signInHref("/checkout")).toBe("/account/sign-in?returnTo=%2Fcheckout");
    expect(signInHref("https://evil.example", "sign-up")).toBe("/account/sign-up");
    // the header's sign-in: back to whichever page it was clicked on, never back onto the auth page itself
    expect(signInHref("/menu/shawarma")).toBe("/account/sign-in?returnTo=%2Fmenu%2Fshawarma");
    expect(signInHref("/account/sign-in")).toBe("/account/sign-in");
  });
});
