import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Profile + checkout share the customer's data. `placeOrder` makes exactly one repository call —
 * `createOrder`, the single order transaction — and hands it the tray's lines and the signed-in account;
 * the account row itself (saved mobile/email winning, first mobile stored, email verified) is read and
 * locked inside that transaction (see tests/create-order-sql.test.ts). Repositories are mocked; no database.
 */
const { createOrder, getCustomerById } = vi.hoisted(() => ({
  createOrder: vi.fn(),
  getCustomerById: vi.fn(),
}));
vi.mock("@/server/repositories/orders", () => ({ createOrder }));
vi.mock("@/server/repositories/customers", () => ({ getCustomerById }));

import { placeOrder } from "@/server/services/checkout";
import { customerAddressSchema, updateProfileSchema } from "@/server/validation/customer-profile";
import type { Tray } from "@/shared/tray";

const restaurant = {
  id: "r1",
  slug: "zaytoun",
  features: { onlineOrdering: true, delivery: true, pickup: true, dineIn: true },
  settings: {},
} as never;
const input = {
  orderType: "pickup",
  fullName: "Noor Ahmed",
  phone: "+923001112222",
  email: "typed@example.com",
  paymentMethod: "cash",
} as never;
const ITEM = "11111111-1111-4111-8111-111111111111";
const tray: Tray = {
  orderType: "pickup",
  locationId: null,
  couponCode: "SAVE10",
  lines: [{ menuItemId: ITEM, variantId: null, quantity: 2, addons: [] }],
};
const account = { id: "c1", restaurantId: "r1", phone: "+923334445555", email: "noor@example.com", fullName: "Noor Ahmed" };

describe("placeOrder is one transaction for the signed-in customer's tray", () => {
  beforeEach(() => {
    createOrder
      .mockReset()
      .mockResolvedValue({ order: { orderNumber: "ORD-1", customerPhone: "+923334445555" }, requiresOnlinePayment: false, customer: account });
    getCustomerById.mockReset();
  });

  it("passes the tray's lines and the account to createOrder, with no other database read", async () => {
    await placeOrder(restaurant, tray, input, { restaurantId: "r1", customerId: "c1", userId: "c1" });
    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(getCustomerById).not.toHaveBeenCalled();
    const [orderInput] = createOrder.mock.calls[0]!;
    expect(orderInput.lines).toEqual(tray.lines);
    expect(orderInput).toMatchObject({
      accountCustomerId: "c1",
      saveAccountPhone: true, // stored only if the account has no mobile yet — decided inside the transaction
      requireVerifiedEmail: true,
      customer: { phone: "+923001112222" },
    });
  });

  it("applies only the promo code the checkout page showed as applied, never a stale one from the tray", async () => {
    await placeOrder(restaurant, tray, input, { restaurantId: "r1", customerId: "c1", userId: "c1" });
    expect(createOrder.mock.calls[0]![0].couponCode).toBeNull();
    await placeOrder(restaurant, tray, { ...(input as object), couponCode: "SAVE10" } as never, { restaurantId: "r1", customerId: "c1" });
    expect(createOrder.mock.calls[1]![0].couponCode).toBe("SAVE10");
  });

  it("refuses an empty tray before touching the database", async () => {
    await expect(
      placeOrder(restaurant, { ...tray, lines: [] }, input, { restaurantId: "r1", customerId: "c1" }),
    ).rejects.toMatchObject({ code: "CART_EMPTY" });
    expect(createOrder).not.toHaveBeenCalled();
  });
});

describe("profile validation", () => {
  it("accepts optional gender / date of birth and normalises the phone to E.164", () => {
    expect(updateProfileSchema.parse({ phone: "+92 300 1234567", gender: "female", dateOfBirth: "1990-05-17" })).toEqual({
      phone: "+923001234567",
      gender: "female",
      dateOfBirth: "1990-05-17",
    });
    expect(updateProfileSchema.parse({ gender: "", dateOfBirth: "" })).toEqual({ gender: null, dateOfBirth: null });
  });

  it("rejects future, impossible or malformed dates and unknown genders", () => {
    const future = new Date(Date.now() + 86_400_000 * 2).toISOString().slice(0, 10);
    for (const dateOfBirth of [future, "1990-02-30", "17/05/1990", "1899-12-31"]) {
      expect(updateProfileSchema.safeParse({ dateOfBirth }).success).toBe(false);
    }
    expect(updateProfileSchema.safeParse({ gender: "robot" }).success).toBe(false);
    expect(updateProfileSchema.safeParse({ phone: "12" }).success).toBe(false);
  });

  it("requires label, street, area and city on a saved address", () => {
    expect(customerAddressSchema.safeParse({ label: "Home", addressLine1: "House 12, Street 5", area: "F-7", city: "Islamabad" }).success).toBe(true);
    const missing = customerAddressSchema.safeParse({ label: "", addressLine1: "", area: "", city: "" });
    expect(missing.success).toBe(false);
    if (!missing.success) expect(missing.error.issues.map((issue) => issue.path[0]).sort()).toEqual(["addressLine1", "area", "city", "label"]);
  });
});

describe("customer profile is read back from the row", () => {
  // the mapper is what the drawer and checkout read through: a value saved in customers.metadata.profile must come back
  it("maps gender and date of birth saved in metadata.profile", async () => {
    const { mapCustomer } = await import("@/server/db/mappers");
    const customer = mapCustomer({
      id: "c1",
      restaurant_id: "r1",
      full_name: "A",
      phone: "+923001112222",
      created_at: new Date(),
      metadata: { profile: { gender: "male", dateOfBirth: "1995-04-12" } },
    });
    expect(customer).toMatchObject({ gender: "male", dateOfBirth: "1995-04-12" });
  });

  it("reads missing, malformed or unknown profile data as not set", async () => {
    const { mapCustomer } = await import("@/server/db/mappers");
    const base = { id: "c1", restaurant_id: "r1", full_name: "A", phone: "+923001112222", created_at: new Date() };
    for (const metadata of [{}, null, { profile: { gender: "robot", dateOfBirth: "12/04/1995" } }, { profile: "x" }]) {
      expect(mapCustomer({ ...base, metadata })).toMatchObject({ gender: null, dateOfBirth: null });
    }
  });
});
