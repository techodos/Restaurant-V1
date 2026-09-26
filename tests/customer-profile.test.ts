import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Profile + checkout share the customer's data: the account's saved mobile and email win over whatever the
 * browser sends, a missing mobile is taken from checkout and stored with the order, and the order is linked
 * to the account's own row. Repositories are mocked; no database.
 */
const { createOrder, getCustomerById, findCart } = vi.hoisted(() => ({
  createOrder: vi.fn(),
  getCustomerById: vi.fn(),
  findCart: vi.fn(),
}));
vi.mock("@/server/repositories/orders", () => ({ createOrder }));
vi.mock("@/server/repositories/customers", () => ({ getCustomerById }));
vi.mock("@/server/services/cart", () => ({ findCart }));

import { placeOrder } from "@/server/services/checkout";
import { customerAddressSchema, updateProfileSchema } from "@/server/validation/customer-profile";

const restaurant = { id: "r1", slug: "zaytoun", features: {}, settings: {} } as never;
const input = {
  orderType: "pickup",
  fullName: "Noor Ahmed",
  phone: "+923001112222",
  email: "typed@example.com",
  paymentMethod: "cash",
} as never;
const account = (phone: string) => ({ id: "c1", restaurantId: "r1", phone, email: "noor@example.com", fullName: "Noor Ahmed" });

describe("placeOrder uses the signed-in customer's account data", () => {
  beforeEach(() => {
    createOrder.mockReset().mockResolvedValue({ order: { orderNumber: "ORD-1" }, requiresOnlinePayment: false });
    getCustomerById.mockReset();
    findCart.mockReset().mockResolvedValue({ id: "cart1", couponCode: null });
  });

  it("uses the saved mobile and account email, never what the browser sent; nothing to save", async () => {
    getCustomerById.mockResolvedValue(account("+923334445555"));
    await placeOrder(restaurant, input, { restaurantId: "r1", customerId: "c1", cartToken: "t" });
    const [orderInput] = createOrder.mock.calls[0]!;
    expect(orderInput.customer).toMatchObject({ phone: "+923334445555", email: "noor@example.com" });
    expect(orderInput).toMatchObject({ accountCustomerId: "c1", saveAccountPhone: false });
  });

  it("takes the entered mobile when the account has none, and asks the order to store it", async () => {
    getCustomerById.mockResolvedValue(account(""));
    await placeOrder(restaurant, input, { restaurantId: "r1", customerId: "c1", cartToken: "t" });
    const [orderInput] = createOrder.mock.calls[0]!;
    expect(orderInput.customer.phone).toBe("+923001112222");
    expect(orderInput).toMatchObject({ accountCustomerId: "c1", saveAccountPhone: true });
  });

  it("refuses when the session's customer no longer exists at this restaurant", async () => {
    getCustomerById.mockResolvedValue({ ...account("+923334445555"), restaurantId: "other" });
    await expect(placeOrder(restaurant, input, { restaurantId: "r1", customerId: "c1", cartToken: "t" })).rejects.toMatchObject({
      code: "SIGN_IN_REQUIRED",
    });
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
