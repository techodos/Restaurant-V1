import { createHmac, randomInt } from "node:crypto";
import { toMinorUnits } from "@/shared/money";

/**
 * JazzCash Hosted Checkout Page (HCP), Mobile Wallet transaction (`pp_TxnType = MWALLET`).
 * Sandbox and live merchant self-service portals, and the Integration Guide PDF that documents
 * the exact field list, come from JazzCash after sandbox onboarding (see SKILL.md section 18);
 * this module implements their publicly documented HMAC-SHA256 request/response signing scheme.
 * **Verify the field list and hash order below against the guide you receive** — payment-gateway
 * signature specs are the one part of an integration that only a real sandbox call can confirm;
 * a hash mismatch shows up as `pp_ResponseCode "999"` ("Invalid checksum") on the return.
 *
 * Flow: `buildWalletCheckout` produces the hidden form fields the browser POSTs straight to
 * JazzCash's hosted page (no redirect indirection through our own server); JazzCash later POSTs
 * the result to `pp_ReturnURL`, which `verifyReturn` authenticates by recomputing the same hash.
 */

const ENDPOINTS = {
  sandbox: "https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/",
  live: "https://payments.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/",
} as const;

export interface JazzCashOptions {
  merchantId: string;
  password: string;
  integritySalt: string;
  env: "sandbox" | "live";
}

export interface JazzCashCheckoutInput {
  /** Money string, e.g. "1250.00" — converted to integer paisas for the request. */
  amount: string;
  /** ISO order id, round-tripped unchanged via `ppmpf_1` so the return callback can look the order up. */
  orderId: string;
  orderNumber: string;
  description: string;
  returnUrl: string;
}

export interface JazzCashCheckout {
  actionUrl: string;
  /** Hidden form fields to POST as-is; includes `pp_SecureHash`. */
  fields: Record<string, string>;
}

export interface JazzCashReturnResult {
  /** false when the secure hash does not match — the payload must not be trusted or acted on. */
  valid: boolean;
  success: boolean;
  responseCode: string | null;
  responseMessage: string | null;
  transactionId: string | null;
  orderId: string | null;
  orderNumber: string | null;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** `yyyyMMddHHmmss` in the transaction's local time, per JazzCash's format. */
function formatTxnDateTime(date: Date): string {
  return (
    date.getFullYear().toString() +
    pad2(date.getMonth() + 1) +
    pad2(date.getDate()) +
    pad2(date.getHours()) +
    pad2(date.getMinutes()) +
    pad2(date.getSeconds())
  );
}

/**
 * JazzCash requires the hash over every non-empty `pp_`/`ppmpf_` value, sorted by key, salted.
 * Exported only so tests can simulate a well-formed return (JazzCash signs its own response
 * fields — request fields it echoes back plus `pp_ResponseCode` etc. — the same way).
 */
export function computeSecureHash(fields: Record<string, string>, integritySalt: string): string {
  const sortedValues = Object.keys(fields)
    .filter((key) => key !== "pp_SecureHash" && fields[key] !== "" && fields[key] !== undefined)
    .sort()
    .map((key) => fields[key]);
  const message = `${integritySalt}&${sortedValues.join("&")}`;
  return createHmac("sha256", integritySalt).update(message).digest("hex").toUpperCase();
}

export function buildWalletCheckout(options: JazzCashOptions, input: JazzCashCheckoutInput): JazzCashCheckout {
  const now = new Date();
  const expiry = new Date(now.getTime() + 60 * 60_000); // 1 hour, matches JazzCash's documented default
  const txnRefNo = `T${now.getTime()}${randomInt(100, 999)}`;

  const fields: Record<string, string> = {
    pp_Version: "1.1",
    pp_TxnType: "MWALLET",
    pp_Language: "EN",
    pp_MerchantID: options.merchantId,
    pp_SubMerchantID: "",
    pp_Password: options.password,
    pp_BankID: "",
    pp_ProductID: "",
    pp_TxnRefNo: txnRefNo,
    pp_Amount: toMinorUnits(input.amount, 2),
    pp_TxnCurrency: "PKR",
    pp_TxnDateTime: formatTxnDateTime(now),
    pp_TxnExpiryDateTime: formatTxnDateTime(expiry),
    pp_BillReference: input.orderNumber,
    pp_Description: input.description.slice(0, 100),
    pp_ReturnURL: input.returnUrl,
    ppmpf_1: input.orderId,
    ppmpf_2: "",
    ppmpf_3: "",
    ppmpf_4: "",
    ppmpf_5: "",
  };
  fields.pp_SecureHash = computeSecureHash(fields, options.integritySalt);

  return { actionUrl: ENDPOINTS[options.env], fields };
}

/** Recomputes the hash over JazzCash's returned fields and checks it against their `pp_SecureHash`. */
export function verifyReturn(params: Record<string, string>, integritySalt: string): JazzCashReturnResult {
  const expectedHash = computeSecureHash(params, integritySalt);
  const valid = Boolean(params.pp_SecureHash) && expectedHash === params.pp_SecureHash?.toUpperCase();
  const responseCode = params.pp_ResponseCode ?? null;
  return {
    valid,
    success: valid && responseCode === "000",
    responseCode,
    responseMessage: params.pp_ResponseMessage ?? null,
    transactionId: params.pp_RetreivalReferenceNo ?? params.pp_TxnRefNo ?? null,
    orderId: valid ? (params.ppmpf_1 ?? null) : null,
    orderNumber: valid ? (params.pp_BillReference ?? null) : null,
  };
}
