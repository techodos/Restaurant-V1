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

/**
 * Demo mode (`JAZZCASH_ENV=demo`): the checkout form posts to this in-app imitation of JazzCash's page instead of
 * JazzCash (`app/(site)/checkout/pay/jazzcash/demo`). Relative, so it stays on whatever host served the checkout.
 */
export const DEMO_CHECKOUT_PATH = "/checkout/pay/jazzcash/demo";

export interface JazzCashOptions {
  merchantId: string;
  password: string;
  integritySalt: string;
  env: "sandbox" | "live" | "demo";
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
  /** JazzCash has not settled it yet (e.g. the customer has not approved it in the app) — neither paid nor failed. */
  pending: boolean;
  responseCode: string | null;
  responseMessage: string | null;
  transactionId: string | null;
  orderId: string | null;
  orderNumber: string | null;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Pakistan Standard Time is a fixed UTC+5 (no DST). */
const PKT_OFFSET_MS = 5 * 60 * 60_000;

/**
 * `yyyyMMddHHmmss` in Pakistan time, per JazzCash's format. Never the server's local clock: on a UTC host
 * (Vercel) that put `pp_TxnExpiryDateTime` hours in the past from JazzCash's point of view.
 */
export function formatTxnDateTime(date: Date): string {
  const pkt = new Date(date.getTime() + PKT_OFFSET_MS);
  return (
    pkt.getUTCFullYear().toString() +
    pad2(pkt.getUTCMonth() + 1) +
    pad2(pkt.getUTCDate()) +
    pad2(pkt.getUTCHours()) +
    pad2(pkt.getUTCMinutes()) +
    pad2(pkt.getUTCSeconds())
  );
}

/**
 * JazzCash requires the hash over every non-empty `pp_`/`ppmpf_` value, sorted by key, salted.
 * Exported only so tests can simulate a well-formed return (JazzCash signs its own response
 * fields — request fields it echoes back plus `pp_ResponseCode` etc. — the same way).
 */
export function computeSecureHash(fields: Record<string, string>, integritySalt: string): string {
  const sortedValues = Object.keys(fields)
    .filter((key) => (key.startsWith("pp_") || key.startsWith("ppmpf_")) && key !== "pp_SecureHash")
    .filter((key) => fields[key] !== "" && fields[key] !== undefined)
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

  return { actionUrl: options.env === "demo" ? DEMO_CHECKOUT_PATH : ENDPOINTS[options.env], fields };
}

/**
 * Response codes JazzCash documents as "not settled yet" rather than failed: `157` (Mobile Account transaction
 * pending) and `124` (order placed, awaiting over-the-counter payment). The sandbox returns pending for any
 * test mobile number other than its success/failure ones.
 */
const PENDING_RESPONSE_CODES = new Set(["124", "157"]);

/** Recomputes the hash over JazzCash's returned fields and checks it against their `pp_SecureHash`. */
export function verifyReturn(params: Record<string, string>, integritySalt: string): JazzCashReturnResult {
  const expectedHash = computeSecureHash(params, integritySalt);
  const valid = Boolean(params.pp_SecureHash) && expectedHash === params.pp_SecureHash?.toUpperCase();
  const responseCode = params.pp_ResponseCode ?? null;
  return {
    valid,
    success: valid && responseCode === "000",
    pending: valid && responseCode !== null && PENDING_RESPONSE_CODES.has(responseCode),
    responseCode,
    responseMessage: params.pp_ResponseMessage ?? null,
    transactionId: params.pp_RetreivalReferenceNo ?? params.pp_TxnRefNo ?? null,
    orderId: valid ? (params.ppmpf_1 ?? null) : null,
    orderNumber: valid ? (params.pp_BillReference ?? null) : null,
  };
}

// ─── demo simulator (JAZZCASH_ENV=demo) ─────────────────────────────────────────
// Stands in for JazzCash's servers so the whole flow can be shown without a working merchant account: it checks
// our signed request, decides an outcome from the same test numbers JazzCash's sandbox documents, and signs a
// response the real return route verifies like any other. No money moves; nothing here runs unless demo mode is on.

/** JazzCash sandbox's documented test accounts (CNIC last 6 digits `345678` for all). */
export const DEMO_TEST_ACCOUNTS = [
  { mobile: "03123456789", result: "Successful" },
  { mobile: "03123456780", result: "Authentication error" },
  { mobile: "Any other number", result: "Pending" },
] as const;

export interface DemoOutcome {
  code: string;
  message: string;
}

/** Our own signature on a request the browser carried to the simulator: anything else must not be acted on. */
export function verifyRequestSignature(fields: Record<string, string>, integritySalt: string): boolean {
  return Boolean(fields.pp_SecureHash) && computeSecureHash(fields, integritySalt) === fields.pp_SecureHash?.toUpperCase();
}

/** A customer-entry problem to show on the demo page, or null when the input can go to "JazzCash". */
export function validateDemoInput(mobile: string, cnic: string): string | null {
  if (!/^03\d{9}$/.test(mobile)) return "Enter an 11-digit mobile account number starting with 03.";
  if (!/^\d{6}$/.test(cnic)) return "Enter the last 6 digits of the CNIC.";
  return null;
}

export function demoOutcome(input: { mobile: string; cnic: string; cancelled: boolean; expiry: string | undefined; now: Date }): DemoOutcome {
  if (input.cancelled) return { code: "199", message: "Transaction cancelled by the customer." };
  if (input.expiry && formatTxnDateTime(input.now) > input.expiry) return { code: "199", message: "Transaction has expired." };
  if (input.mobile === "03123456789" && input.cnic === "345678") {
    return { code: "000", message: "Thank you for Using JazzCash, your transaction was successful." };
  }
  if (input.mobile === "03123456780") return { code: "199", message: "Authentication error: the mobile account could not be verified." };
  return { code: "157", message: "Transaction is pending. Approve it in the JazzCash app." };
}

/** The signed fields "JazzCash" posts back to `pp_ReturnURL`, shaped like a real Mobile Wallet response. */
export function buildDemoReturn(request: Record<string, string>, outcome: DemoOutcome, integritySalt: string): Record<string, string> {
  const echo = (key: string) => request[key] ?? "";
  const fields: Record<string, string> = {
    pp_Amount: echo("pp_Amount"),
    pp_AuthCode: outcome.code === "000" ? String(randomInt(100000, 999999)) : "",
    pp_BankID: echo("pp_BankID"),
    pp_BillReference: echo("pp_BillReference"),
    pp_Language: echo("pp_Language"),
    pp_MerchantID: echo("pp_MerchantID"),
    pp_ResponseCode: outcome.code,
    pp_ResponseMessage: outcome.message,
    pp_RetreivalReferenceNo: `DEMO${randomInt(10_000_000, 99_999_999)}`,
    pp_SubMerchantId: echo("pp_SubMerchantID"),
    pp_TxnCurrency: echo("pp_TxnCurrency"),
    pp_TxnDateTime: echo("pp_TxnDateTime"),
    pp_TxnRefNo: echo("pp_TxnRefNo"),
    pp_TxnType: echo("pp_TxnType"),
    pp_Version: echo("pp_Version"),
    ppmpf_1: echo("ppmpf_1"),
    ppmpf_2: echo("ppmpf_2"),
    ppmpf_3: echo("ppmpf_3"),
    ppmpf_4: echo("ppmpf_4"),
    ppmpf_5: echo("ppmpf_5"),
  };
  fields.pp_SecureHash = computeSecureHash(fields, integritySalt);
  return fields;
}

