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
import { randomUUID } from "node:crypto";
import { logger } from "@/server/logger";
import { checkRateLimit } from "@/server/rate-limit";
import { getEmailProvider } from "@/server/services/notifications";
import { renderAccountDeletionRequestEmail } from "@/server/notifications/templates/deletion-request";
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

/**
 * "Request account deletion": there is no automated deletion, so the request is emailed to the
 * restaurant's own contact address by the server (Reply-To = the customer), not left to the customer's
 * mail app. Rate limited per customer; the provider also de-duplicates a repeat within the hour.
 */
export async function requestAccountDeletion(
  restaurant: Pick<Restaurant, "id" | "name" | "email" | "phone" | "logoUrl" | "primaryColor">,
  visitor: Visitor,
): Promise<void> {
  const customerId = requireCustomerId(visitor);
  const customer = await loadCustomer(restaurant, customerId);

  if (!restaurant.email) {
    throw errors.validation("This restaurant has no contact email yet. Please call them to delete your account.");
  }
  checkRateLimit({ key: "account-deletion-request", identifier: customerId, limit: 2, windowMs: 60 * 60_000 });

  const provider = getEmailProvider();
  if (!provider) {
    throw errors.validation("We cannot send the request right now. Please contact the restaurant to delete your account.");
  }
  const rendered = renderAccountDeletionRequestEmail({
    brand: {
      name: restaurant.name,
      logoUrl: restaurant.logoUrl ?? null,
      primaryColor: restaurant.primaryColor ?? null,
      email: restaurant.email,
      phone: restaurant.phone ?? null,
    },
    customerName: customer.fullName,
    customerEmail: customer.email,
    customerPhone: customer.phone.trim() ? customer.phone : null,
    requestedAt: new Date(),
  });
  const result = await provider.send({
    to: restaurant.email,
    fromName: restaurant.name,
    replyTo: customer.email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    // One key per request. Resend refuses a key it has seen (for 24 h) with a different body (409
    // invalid_idempotent_request), and this body carries the request time, so a key derived from the customer
    // and the hour made every second request in that hour fail. The per-customer rate limit stops repeats.
    idempotencyKey: `account-deletion-${customerId}-${randomUUID()}`,
  });
  if (!result.ok) {
    logger.error("notifications", `account deletion request for customer ${customerId} not sent`, result.error);
    throw errors.validation("We could not send your request. Please try again in a moment.");
  }
}
