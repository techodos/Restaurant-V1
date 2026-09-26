import { beforeEach, describe, expect, it, vi } from "vitest";

/** Only signed-in customers with a verified email may place an order. The customer lookup is mocked. */
const { getCustomerById } = vi.hoisted(() => ({ getCustomerById: vi.fn() }));
vi.mock("@/server/repositories/customers", () => ({
  getCustomerById,
  getCustomerByGoogleSubOrEmail: vi.fn(),
  markCustomerEmailVerified: vi.fn(),
  linkGoogleToCustomer: vi.fn(),
  createGoogleCustomer: vi.fn(),
}));

import { assertCanPlaceOrder } from "@/server/services/customer-auth";
import { safeReturnTo, signInHref } from "@/shared/return-to";

const codeOf = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return "OK";
  } catch (error) {
    return (error as { code?: string }).code;
  }
};

describe("assertCanPlaceOrder", () => {
  beforeEach(() => getCustomerById.mockReset());

  it("refuses a guest (no customer session) with SIGN_IN_REQUIRED, without a database read", async () => {
    expect(await codeOf(assertCanPlaceOrder({ userId: null, customerId: null }))).toBe("SIGN_IN_REQUIRED");
    expect(await codeOf(assertCanPlaceOrder({}))).toBe("SIGN_IN_REQUIRED");
    expect(getCustomerById).not.toHaveBeenCalled();
  });

  it("refuses a signed-in customer whose email is not verified", async () => {
    getCustomerById.mockResolvedValue({ id: "c1", emailVerified: false });
    expect(await codeOf(assertCanPlaceOrder({ userId: "c1", customerId: "c1" }))).toBe("EMAIL_NOT_VERIFIED");
  });

  it("refuses when the customer row cannot be found", async () => {
    getCustomerById.mockResolvedValue(null);
    expect(await codeOf(assertCanPlaceOrder({ userId: "c1", customerId: "c1" }))).toBe("EMAIL_NOT_VERIFIED");
  });

  it("allows a signed-in, verified customer", async () => {
    getCustomerById.mockResolvedValue({ id: "c1", emailVerified: true });
    expect(await codeOf(assertCanPlaceOrder({ userId: "c1", customerId: "c1" }))).toBe("OK");
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
  });
});
