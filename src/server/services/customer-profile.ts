import type { RequestContext } from "@/server/context";
import { errors } from "@/server/errors";
import {
  deleteAddress,
  getCustomerById,
  listAddresses,
  saveAddress,
  updateAddress,
  updateCustomerProfile as updateCustomerProfileRow,
} from "@/server/repositories/customers";
import type { Customer, CustomerAddress, CustomerGender, Restaurant } from "@/shared/contract/models";
import type { CustomerAddressInput, UpdateProfileInput } from "@/server/validation/customer-profile";

/**
 * The signed-in customer's own profile and saved addresses. Every call is scoped to the customer of the
 * current session (visitor.customerId); there is no way to name another customer. Shared by the profile
 * drawer and checkout, so both always read the same data.
 */
export interface CustomerProfile {
  fullName: string;
  email: string | null;
  /** E.164, or null when the account has no mobile yet (checkout then asks for one, once) */
  phone: string | null;
  gender: CustomerGender | null;
  dateOfBirth: string | null;
  /** from the account itself (customers.auth_provider), never guessed from the email */
  authProvider: "google" | "password";
  addresses: CustomerAddress[];
}

type Visitor = Pick<RequestContext, "customerId" | "cartToken">;

function requireCustomerId(visitor: Visitor): string {
  if (!visitor.customerId) throw errors.custom("SIGN_IN_REQUIRED", "Please sign in to manage your profile.");
  return visitor.customerId;
}

function toProfile(customer: Customer, addresses: CustomerAddress[]): CustomerProfile {
  return {
    fullName: customer.fullName,
    email: customer.email,
    phone: customer.phone.trim() ? customer.phone : null,
    gender: customer.gender ?? null,
    dateOfBirth: customer.dateOfBirth ?? null,
    authProvider: customer.authProvider === "google" ? "google" : "password",
    addresses,
  };
}

async function loadCustomer(restaurant: Pick<Restaurant, "id">, customerId: string): Promise<Customer> {
  const customer = await getCustomerById(customerId, { restaurantId: restaurant.id, customerId });
  if (!customer || customer.restaurantId !== restaurant.id) throw errors.custom("SIGN_IN_REQUIRED", "Please sign in again.");
  return customer;
}

export async function getCustomerProfile(restaurant: Pick<Restaurant, "id">, visitor: Visitor): Promise<CustomerProfile> {
  const customerId = requireCustomerId(visitor);
  const ctx = { restaurantId: restaurant.id, customerId };
  const [customer, addresses] = await Promise.all([loadCustomer(restaurant, customerId), listAddresses(customerId, ctx)]);
  return toProfile(customer, addresses);
}

export async function updateCustomerProfile(
  restaurant: Pick<Restaurant, "id">,
  visitor: Visitor,
  input: UpdateProfileInput,
): Promise<CustomerProfile> {
  const customerId = requireCustomerId(visitor);
  const ctx = { restaurantId: restaurant.id, customerId };
  const customer = await updateCustomerProfileRow(customerId, restaurant.id, input, ctx);
  return toProfile(customer, await listAddresses(customerId, ctx));
}

export async function saveCustomerAddress(
  restaurant: Pick<Restaurant, "id">,
  visitor: Visitor,
  input: CustomerAddressInput,
): Promise<CustomerAddress[]> {
  const customerId = requireCustomerId(visitor);
  const ctx = { restaurantId: restaurant.id, customerId };
  const fields = {
    label: input.label,
    addressLine1: input.addressLine1,
    addressLine2: input.addressLine2,
    area: input.area,
    city: input.city,
    postalCode: input.postalCode,
    deliveryNotes: input.deliveryNotes,
    ...(input.latitude !== undefined ? { latitude: input.latitude } : {}),
    ...(input.longitude !== undefined ? { longitude: input.longitude } : {}),
    ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
  };
  if (input.id) {
    const updated = await updateAddress(input.id, customerId, restaurant.id, fields, ctx);
    if (!updated) throw errors.notFound("Address");
  } else {
    await saveAddress(customerId, restaurant.id, fields, ctx);
  }
  return listAddresses(customerId, ctx);
}

export async function deleteCustomerAddress(
  restaurant: Pick<Restaurant, "id">,
  visitor: Visitor,
  addressId: string,
): Promise<CustomerAddress[]> {
  const customerId = requireCustomerId(visitor);
  const ctx = { restaurantId: restaurant.id, customerId };
  if (!(await deleteAddress(addressId, customerId, restaurant.id, ctx))) throw errors.notFound("Address");
  return listAddresses(customerId, ctx);
}
