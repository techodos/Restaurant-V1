import type { OrderType, PaymentMethod } from "@/shared/contract/enums";
import type { Money } from "@/shared/contract/models";
import { dec } from "@/shared/money";

/**
 * In-store POS (/pos): the parts the till (browser, offline too) and the server share. A counter sale is an
 * ordinary order (source 'pos') — these types only describe how the till talks about it. SKILL.md §43.
 */

/** What the cashier taps on the payment screen; each maps onto the platform's own payment_method + provider. */
export const POS_TENDERS = ["cash", "card", "jazzcash", "easypaisa", "raast"] as const;
export type PosTender = (typeof POS_TENDERS)[number];

export const POS_TENDER_METHOD: Record<PosTender, { method: PaymentMethod; provider: string }> = {
  cash: { method: "cash", provider: "cash" },
  card: { method: "card_terminal", provider: "card_terminal" },
  jazzcash: { method: "wallet", provider: "jazzcash" },
  easypaisa: { method: "wallet", provider: "easypaisa" },
  raast: { method: "bank_transfer", provider: "raast" },
};

export const POS_TENDER_LABELS: Record<PosTender, string> = {
  cash: "Cash",
  card: "Card",
  jazzcash: "JazzCash",
  easypaisa: "Easypaisa",
  raast: "Raast QR",
};

/** An invoice's payment method as the till names it (wallet = JazzCash or Easypaisa, bank transfer = Raast). */
export const POS_METHOD_LABELS: Partial<Record<PaymentMethod, string>> = {
  cash: "Cash",
  card_terminal: "Card",
  wallet: "JazzCash / Easypaisa",
  bank_transfer: "Raast QR",
};

/** The till's order types (the platform's own; "Takeaway" is pickup). */
export const POS_ORDER_TYPES: readonly OrderType[] = ["dine_in", "pickup", "delivery"];
export const POS_ORDER_TYPE_LABELS: Record<OrderType, string> = { dine_in: "Dine-in", pickup: "Takeaway", delivery: "Delivery" };

/** Our invoice number: the till's code + its own sequence, e.g. GUL1-000042. Sequential per till, offline too. */
export function formatInvoiceNumber(deviceCode: string, seq: number): string {
  return `${deviceCode}-${String(seq).padStart(6, "0")}`;
}

/** A till code from its name: letters/digits only, upper-case, 2–8 chars ("Gulberg till 1" -> "GULBERG1" -> "GULB1"). */
export function suggestDeviceCode(branchName: string, index: number): string {
  const letters = branchName.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) || "POS";
  return `${letters.padEnd(2, "X")}${index}`.slice(0, 8);
}

/**
 * Quick cash amounts for a total: exact, then the next 500 / 1,000 / 5,000 note above it (topped up with the next 100).
 * 2,366 -> [2,366, 2,500, 3,000, 5,000]; at most `count` distinct values, ascending.
 */
export function quickCashAmounts(total: Money, count = 4): Money[] {
  const exact = dec(total);
  const amounts = [exact];
  for (const step of [500, 1000, 5000, 100]) {
    const rounded = exact.dividedBy(step).ceil().times(step);
    if (rounded.greaterThan(exact) && !amounts.some((amount) => amount.equals(rounded))) amounts.push(rounded);
  }
  return amounts
    .slice(0, count)
    .sort((a, b) => a.comparedTo(b))
    .map((amount) => amount.toFixed(2));
}

/** Change due for a cash tender (never negative). */
export function changeDue(total: Money, tendered: Money): Money {
  const change = dec(tendered).minus(dec(total));
  return (change.isNegative() ? dec(0) : change).toFixed(2);
}

// ---------------------------------------------------------------------------------------------------------------
// The till's queue: every action is an op with its own id (idempotency key). Online it is sent at once; offline it
// waits in IndexedDB and is replayed in order. The server applies each op at most once, whatever is retried.
// ---------------------------------------------------------------------------------------------------------------

export interface PosLineInput {
  /** the till's id for the line: re-sending a ticket adds only lines the order does not have yet */
  clientLineId: string;
  menuItemId: string;
  variantId: string | null;
  quantity: number;
  addons: { addonId: string; quantity: number }[];
  notes?: string | null;
}

export interface PosTicketInput {
  /** the till's id for the order = the order's idempotency key */
  clientOrderId: string;
  orderType: OrderType;
  tableNumber?: string | null;
  guests?: number | null;
  customerName?: string | null;
  customerPhone?: string | null;
  /** delivery orders taken at the till (phone orders): the address as typed */
  address?: string | null;
  notes?: string | null;
  lines: PosLineInput[];
}

export interface PosTenderInput {
  clientPaymentId: string;
  tender: PosTender;
  amount: Money;
  /** cash only: what the customer handed over */
  tendered?: Money | null;
}

export interface PosSaleInput {
  clientOrderId: string;
  /** the invoice number the till assigned and printed (sequence of THIS till) */
  invoiceSeq: number;
  issuedAt: string;
  tenders: PosTenderInput[];
  /** what the till printed — the server re-prices and reports a mismatch, it never trusts these */
  expectedTotal: Money;
}

export type PosOp =
  | { id: string; kind: "ticket"; shiftId: string; ticket: PosTicketInput }
  | { id: string; kind: "sale"; shiftId: string; ticket: PosTicketInput; sale: PosSaleInput };

export interface PosOpResult {
  id: string;
  ok: boolean;
  /** the op had already been applied (a retry): nothing new was written */
  replayed?: boolean;
  orderId?: string;
  orderNumber?: string;
  invoiceNumber?: string;
  /** the server's total differed from what the till printed (menu changed while offline) */
  totalMismatch?: { expected: Money; actual: Money } | null;
  /** the invoice's authority state right after the sale (sent at once, with a short timeout) */
  fiscal?: { status: FiscalStatus; authorityInvoiceNumber: string | null; qrPayload: string | null } | null;
  /** a permanent refusal (bad data, closed shift): the till stops retrying and shows it */
  error?: { code: string; message: string };
}

/** Fiscal (PRA/FBR) state shown on the till. */
export const FISCAL_STATUSES = ["pending", "synced", "failed"] as const;
export type FiscalStatus = (typeof FISCAL_STATUSES)[number];

// ---------------------------------------------------------------------------------------------------------------
// Models (domain shapes; DB rows stay in repositories/pos.ts)
// ---------------------------------------------------------------------------------------------------------------

export interface PosDevice {
  id: string;
  restaurantId: string;
  locationId: string;
  locationName: string;
  name: string;
  code: string;
  /** highest invoice sequence the server has recorded for this till */
  lastInvoiceSeq: number;
  isActive: boolean;
}

export interface PosShift {
  id: string;
  deviceId: string;
  locationId: string;
  shiftNumber: number;
  businessDate: string;
  status: "open" | "closed";
  openedByName: string;
  openedAt: string;
  openingFloat: Money;
  closedAt: string | null;
  closedByName: string | null;
  countedCash: Money | null;
  expectedCash: Money | null;
}

export interface FiscalInvoiceView {
  id: string;
  orderId: string;
  kind: "sale" | "credit_note";
  invoiceNumber: string;
  issuedAt: string;
  paymentMethod: PaymentMethod;
  total: Money;
  taxAmount: Money;
  status: FiscalStatus;
  authorityInvoiceNumber: string | null;
  qrPayload: string | null;
  lastError: string | null;
}

/** One printed line of a receipt / invoice. */
export interface ReceiptLine {
  name: string;
  variant: string | null;
  quantity: number;
  unitPrice: Money;
  lineTotal: Money;
}

export interface ZReportTender {
  tender: string;
  label: string;
  received: Money;
  refunded: Money;
  net: Money;
}

export interface ZReport {
  shiftId: string;
  generatedAt: string;
  orders: number;
  salesCount: number;
  creditNotes: number;
  /** sales before tax (net of credit notes) */
  netSales: Money;
  taxCollected: Money;
  totalTakings: Money;
  tenders: ZReportTender[];
  openingFloat: Money;
  cashSales: Money;
  cashRefunds: Money;
  expectedCash: Money;
  /** null until counted */
  countedCash: Money | null;
  /** counted − expected (negative = short) */
  difference: Money | null;
  fiscal: { synced: number; pending: number; failed: number };
  /** open orders on this shift that were sent to the kitchen but never paid */
  unpaidOrders: number;
}

/** Everything the till needs to work offline, fetched once per sign-in / refresh and cached in IndexedDB. */
export interface PosBootstrap {
  restaurant: {
    id: string;
    name: string;
    currency: string;
    currencySymbol: string;
    locale: string;
    timezone: string;
  };
  /** the restaurant's pricing settings (tax rates, service fee) — the till prices with priceTicket() */
  settings: import("@/shared/contract/settings").RestaurantSettings;
  receipt: ReceiptHeader;
  cashier: { memberId: string; name: string; canManage: boolean; locationId: string | null };
  /** branches this cashier may work at (a branch-scoped member: their own) — the receipt prints its address */
  branches: { id: string; name: string; address: string; phone: string | null }[];
  categories: { id: string; name: string }[];
  menu: import("@/shared/contract/models").MenuItem[];
  /** items switched off per branch (menu_item_location_overrides) */
  branchUnavailable: Record<string, readonly string[]>;
  devices: PosDevice[];
  fiscalProvider: string;
  generatedAt: string;
}

export interface ReceiptHeader {
  businessName: string;
  ntn: string | null;
  pntn: string | null;
  footerNote: string | null;
  taxLabel: string;
}

// ---------------------------------------------------------------------------------------------------------------
// Fiscal reporting (server-side: services/fiscal.ts, integrations/fiscal.ts)
// ---------------------------------------------------------------------------------------------------------------

/** What the authority adapter is given: the immutable invoice plus who issued it. */
export interface FiscalInvoiceDocument {
  id: string;
  restaurantId: string;
  kind: "sale" | "credit_note";
  invoiceNumber: string;
  originalInvoiceNumber: string | null;
  originalAuthorityInvoiceNumber: string | null;
  issuedAt: string;
  paymentMethod: PaymentMethod;
  subtotal: string;
  discount: string;
  serviceFee: string;
  taxRate: string;
  taxAmount: string;
  total: string;
  currency: string;
  lines: ReceiptLine[];
  attempts: number;
  seller: { name: string; ntn: string | null; pntn: string | null; branchName: string; deviceCode: string };
  buyer: { name: string; phone: string | null };
}

export type FiscalOutcome =
  | { kind: "synced"; authorityInvoiceNumber: string; qrPayload: string }
  | { kind: "retryable" | "rejected"; error: string };

