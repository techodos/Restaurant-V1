import { describe, expect, it } from "vitest";
import { buildWalletCheckout, computeSecureHash, verifyReturn } from "@/server/integrations/jazzcash";

/** Stands in for JazzCash's server: signs its own response fields the same way we sign requests. */
function signAsGateway(fields: Record<string, string>, integritySalt: string): Record<string, string> {
  const { pp_SecureHash: _discard, ...rest } = fields;
  return { ...rest, pp_SecureHash: computeSecureHash(rest, integritySalt) };
}

/** DB-free: pure request/response signing, the correctness-critical part of the integration. */
describe("JazzCash wallet checkout", () => {
  const options = {
    merchantId: "MC12345",
    password: "pw-secret",
    integritySalt: "salt-secret",
    env: "sandbox" as const,
  };

  it("builds a request whose secure hash verifies against itself", () => {
    const { actionUrl, fields } = buildWalletCheckout(options, {
      amount: "1250.00",
      orderId: "11111111-1111-1111-1111-111111111111",
      orderNumber: "ORD-1001",
      description: "Order ORD-1001",
      returnUrl: "https://example.test/r/bella-napoli/checkout/pay/jazzcash",
    });

    expect(actionUrl).toContain("sandbox.jazzcash.com.pk");
    expect(fields.pp_Amount).toBe("125000"); // Rs 1250.00 -> paisas
    expect(fields.pp_MerchantID).toBe(options.merchantId);
    expect(fields.pp_TxnType).toBe("MWALLET");
    expect(fields.pp_SecureHash).toMatch(/^[0-9A-F]+$/);

    // Simulate JazzCash echoing the request fields back, plus its own response fields, re-signed.
    const returned = signAsGateway({ ...fields, pp_ResponseCode: "000", pp_ResponseMessage: "Success" }, options.integritySalt);
    const result = verifyReturn(returned, options.integritySalt);
    expect(result.valid).toBe(true);
    expect(result.success).toBe(true);
    expect(result.orderId).toBe("11111111-1111-1111-1111-111111111111");
    expect(result.orderNumber).toBe("ORD-1001");
  });

  it("rejects a tampered field", () => {
    const { fields } = buildWalletCheckout(options, {
      amount: "500.00",
      orderId: "id-2",
      orderNumber: "ORD-2002",
      description: "Order ORD-2002",
      returnUrl: "https://example.test/return",
    });
    const tampered = { ...fields, pp_Amount: "999999", pp_ResponseCode: "000" };
    const result = verifyReturn(tampered, options.integritySalt);
    expect(result.valid).toBe(false);
    expect(result.orderId).toBeNull(); // never trust the payload once the hash fails
  });

  it("treats a non-'000' response code as unsuccessful even with a valid hash", () => {
    const { fields } = buildWalletCheckout(options, {
      amount: "500.00",
      orderId: "id-3",
      orderNumber: "ORD-3003",
      description: "Order ORD-3003",
      returnUrl: "https://example.test/return",
    });
    const declined = signAsGateway({ ...fields, pp_ResponseCode: "121", pp_ResponseMessage: "Insufficient balance" }, options.integritySalt);
    const result = verifyReturn(declined, options.integritySalt);
    expect(result.valid).toBe(true);
    expect(result.success).toBe(false);
    expect(result.responseMessage).toBe("Insufficient balance");
  });

  it("generates a unique pp_TxnRefNo per attempt", () => {
    const a = buildWalletCheckout(options, {
      amount: "10.00",
      orderId: "id-4",
      orderNumber: "ORD-4",
      description: "d",
      returnUrl: "https://example.test/return",
    });
    const b = buildWalletCheckout(options, {
      amount: "10.00",
      orderId: "id-4",
      orderNumber: "ORD-4",
      description: "d",
      returnUrl: "https://example.test/return",
    });
    expect(a.fields.pp_TxnRefNo).not.toBe(b.fields.pp_TxnRefNo);
  });
});
