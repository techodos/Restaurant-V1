import { beforeEach, describe, expect, it, vi } from "vitest";

/** "Request account deletion" is emailed by the server to the restaurant (Reply-To = the customer). Provider and customer lookup are mocked. */
const { send, getEmailProvider, getCustomerById } = vi.hoisted(() => ({
  send: vi.fn(),
  getEmailProvider: vi.fn(),
  getCustomerById: vi.fn(),
}));
vi.mock("@/server/services/notifications", () => ({ getEmailProvider }));
vi.mock("@/server/repositories/customers", () => ({
  getCustomerById,
  deleteAddress: vi.fn(),
  listAddresses: vi.fn(),
  saveAddress: vi.fn(),
  updateAddress: vi.fn(),
  updateCustomerProfile: vi.fn(),
}));

import { requestAccountDeletion } from "@/server/services/customer-profile";

const restaurant = { id: "r1", name: "Zaytoun", email: "owner@zaytoun.pk", phone: "+92 51 2612 401", logoUrl: null, primaryColor: null };
const customer = { id: "c1", restaurantId: "r1", fullName: "Abdul Wahab", email: "abdul@example.com", phone: "+923001112222" };
const code = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return "OK";
  } catch (error) {
    return (error as { code?: string }).code;
  }
};

let seq = 0;
const who = () => ({ customerId: `c-${++seq}` }); // the rate limit is per customer and remembered across tests

describe("requestAccountDeletion", () => {
  beforeEach(() => {
    send.mockReset().mockResolvedValue({ ok: true, id: "e1" });
    getEmailProvider.mockReset().mockReturnValue({ name: "test", send });
    getCustomerById.mockReset().mockResolvedValue(customer);
  });

  it("refuses a guest", async () => {
    expect(await code(requestAccountDeletion(restaurant, { customerId: null }))).toBe("SIGN_IN_REQUIRED");
    expect(send).not.toHaveBeenCalled();
  });

  it("emails the restaurant with the customer as Reply-To and the account details in the body", async () => {
    expect(await code(requestAccountDeletion(restaurant, who()))).toBe("OK");
    const [message] = send.mock.calls[0]!;
    expect(message).toMatchObject({ to: "owner@zaytoun.pk", replyTo: "abdul@example.com", fromName: "Zaytoun" });
    expect(message.subject).toContain("Abdul Wahab");
    expect(message.text).toContain("abdul@example.com");
    expect(message.text).toContain("+923001112222");
    expect(message.idempotencyKey).toMatch(/^account-deletion-c-\d+-[0-9a-f-]{36}$/);
  });

  it("uses a different idempotency key for every request (Resend rejects a reused key whose body changed)", async () => {
    const same = who();
    await requestAccountDeletion(restaurant, same);
    await requestAccountDeletion(restaurant, same);
    const keys = send.mock.calls.map(([message]) => message.idempotencyKey);
    expect(new Set(keys).size).toBe(2);
  });

  it("explains itself when the restaurant has no contact email, or email is not configured", async () => {
    expect(await code(requestAccountDeletion({ ...restaurant, email: null }, who()))).toBe("VALIDATION_ERROR");
    getEmailProvider.mockReturnValue(null);
    expect(await code(requestAccountDeletion(restaurant, who()))).toBe("VALIDATION_ERROR");
    expect(send).not.toHaveBeenCalled();
  });

  it("does not report success when the provider fails", async () => {
    send.mockResolvedValue({ ok: false, retryable: true, error: "429" });
    expect(await code(requestAccountDeletion(restaurant, who()))).toBe("VALIDATION_ERROR");
  });

  it("is rate limited per customer", async () => {
    const rate = who();
    const results: (string | undefined)[] = [];
    for (let i = 0; i < 3; i++) results.push(await code(requestAccountDeletion(restaurant, rate)));
    expect(results).toEqual(["OK", "OK", "RATE_LIMITED"]);
  });
});
