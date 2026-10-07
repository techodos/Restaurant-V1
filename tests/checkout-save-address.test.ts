import { beforeEach, describe, expect, it, vi } from "vitest";

/** Checkout's "Save this address for next time" (services/customer-profile.ts#rememberCheckoutAddress). DB-free. */
const { store } = vi.hoisted(() => ({ store: { addresses: [] as Record<string, unknown>[], saved: [] as Record<string, unknown>[], fail: false } }));

vi.mock("@/server/repositories/customers", () => ({
  listAddresses: vi.fn(async () => store.addresses),
  saveAddress: vi.fn(async (_c: string, _r: string, fields: Record<string, unknown>) => {
    if (store.fail) throw new Error("db down");
    store.saved.push(fields);
  }),
  deleteAddress: vi.fn(),
  getCustomerById: vi.fn(),
  getCustomerWithAddresses: vi.fn(),
  updateAddress: vi.fn(),
  updateCustomerProfile: vi.fn(),
}));

import { rememberCheckoutAddress } from "@/server/services/customer-profile";

const restaurant = { id: "11111111-1111-4111-8111-111111111111" };
const visitor = { customerId: "22222222-2222-4222-8222-222222222222" };
const order = { orderType: "delivery", saveAddressAs: "Home", addressLine1: "12 Canal Road", area: "Gulberg", city: "Lahore" };

beforeEach(() => {
  store.addresses = [];
  store.saved = [];
  store.fail = false;
});

describe("save the checkout address for next time", () => {
  it("saves a new delivery address under the chosen name; the first one becomes the default", async () => {
    await rememberCheckoutAddress(restaurant, visitor, order);
    expect(store.saved).toEqual([expect.objectContaining({ label: "Home", addressLine1: "12 Canal Road", area: "Gulberg", city: "Lahore", isDefault: true })]);
  });

  it("does not save a duplicate (same street/area/city, any case) and does not steal the default", async () => {
    store.addresses = [{ id: "a", addressLine1: "12 canal road ", area: "GULBERG", city: "Lahore" }];
    await rememberCheckoutAddress(restaurant, visitor, order);
    expect(store.saved).toEqual([]);
    store.addresses = [{ id: "a", addressLine1: "1 Mall Road", area: "Gulberg", city: "Lahore" }];
    await rememberCheckoutAddress(restaurant, visitor, { ...order, saveAddressAs: "Work" });
    expect(store.saved).toEqual([expect.objectContaining({ label: "Work", isDefault: false })]);
  });

  it("skips when unticked, not delivery, a guest, or the address is incomplete", async () => {
    await rememberCheckoutAddress(restaurant, visitor, { ...order, saveAddressAs: "" });
    await rememberCheckoutAddress(restaurant, visitor, { ...order, orderType: "pickup" });
    await rememberCheckoutAddress(restaurant, { customerId: null }, order);
    await rememberCheckoutAddress(restaurant, visitor, { ...order, area: "" });
    expect(store.saved).toEqual([]);
  });

  it("never throws (the order is already placed)", async () => {
    store.fail = true;
    await expect(rememberCheckoutAddress(restaurant, visitor, order)).resolves.toBeUndefined();
  });
});
