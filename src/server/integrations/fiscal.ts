import { createHash } from "node:crypto";
import { config } from "@/server/config";
import type { FiscalInvoiceDocument, FiscalOutcome } from "@/shared/pos";

/**
 * Tax-authority reporting of POS invoices (PRA today, FBR possible). Server-only: credentials live in env vars
 * (config.fiscal) and only services/fiscal.ts calls an adapter — never the browser.
 *
 * An adapter turns one immutable invoice into the authority's answer. It never throws for an authority problem:
 * network errors and 5xx are `retryable`; a refusal of the data itself is `rejected` (still retried on the slow
 * schedule — the invoice cannot change, but the restaurant's registration or our adapter can be fixed).
 * `request`/`response` are stored verbatim in fiscal_invoice_attempts (the request/response log).
 */
export interface FiscalSubmission {
  outcome: FiscalOutcome;
  request: unknown;
  response: unknown;
}

export interface FiscalAdapter {
  readonly name: string;
  submit(invoice: FiscalInvoiceDocument, signal?: AbortSignal): Promise<FiscalSubmission>;
}

/** The invoice as the authority would receive it — one shape, shared by every adapter and logged as the request. */
export function fiscalRequestPayload(invoice: FiscalInvoiceDocument) {
  return {
    invoiceType: invoice.kind === "credit_note" ? "CREDIT_NOTE" : "SALE",
    invoiceNumber: invoice.invoiceNumber,
    originalInvoiceNumber: invoice.originalAuthorityInvoiceNumber ?? invoice.originalInvoiceNumber,
    dateTime: invoice.issuedAt,
    posId: invoice.seller.deviceCode,
    seller: { name: invoice.seller.name, ntn: invoice.seller.ntn, pntn: invoice.seller.pntn, branch: invoice.seller.branchName },
    buyer: { name: invoice.buyer.name, phone: invoice.buyer.phone },
    paymentMode: invoice.paymentMethod,
    items: invoice.lines.map((line) => ({
      name: line.variant ? `${line.name} (${line.variant})` : line.name,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      total: line.lineTotal,
    })),
    totalSaleValue: invoice.subtotal,
    discount: invoice.discount,
    serviceCharges: invoice.serviceFee,
    taxRate: invoice.taxRate,
    totalTaxCharged: invoice.taxAmount,
    totalBillAmount: invoice.total,
    currency: invoice.currency,
  };
}

/**
 * Answers like an authority without calling anyone (FISCAL_PROVIDER=mock, the default until PRA registration):
 * a stable authority number derived from the invoice, and a QR payload in the authority's style. `failures`
 * (tests, demos) makes the first N submits of each invoice fail, to exercise the retry path.
 */
export class MockFiscalAdapter implements FiscalAdapter {
  readonly name = "mock";
  private readonly seen = new Map<string, number>();

  constructor(private readonly options: { failures?: number; reject?: boolean } = {}) {}

  async submit(invoice: FiscalInvoiceDocument): Promise<FiscalSubmission> {
    const request = fiscalRequestPayload(invoice);
    const count = (this.seen.get(invoice.id) ?? 0) + 1;
    this.seen.set(invoice.id, count);
    if (this.options.reject) {
      return { outcome: { kind: "rejected", error: "MOCK: invoice rejected" }, request, response: { status: 400, error: "rejected" } };
    }
    if (count <= (this.options.failures ?? 0)) {
      return { outcome: { kind: "retryable", error: `MOCK: authority unavailable (attempt ${count})` }, request, response: { status: 503 } };
    }
    const digest = createHash("sha256").update(`${invoice.restaurantId}:${invoice.invoiceNumber}`).digest("hex").slice(0, 10).toUpperCase();
    const authorityInvoiceNumber = `PRA-MOCK-${digest}`;
    const qrPayload = `https://e.pra.punjab.gov.pk/verify?inv=${authorityInvoiceNumber}&amt=${invoice.total}&dt=${encodeURIComponent(invoice.issuedAt)}`;
    return { outcome: { kind: "synced", authorityInvoiceNumber, qrPayload }, request, response: { status: 200, invoiceNumber: authorityInvoiceNumber, qr: qrPayload } };
  }
}

/**
 * PRA (Punjab Revenue Authority) e-invoicing. The endpoint, payload fields and signing come with the restaurant's
 * PRA registration; until then this reports every invoice as retryable, so nothing is lost and the queue drains
 * the moment the real call is written here. Credentials: config.fiscal.pra (.env.example, fiscal section).
 */
export class PraFiscalAdapter implements FiscalAdapter {
  readonly name = "pra";

  constructor(private readonly credentials: { apiUrl: string; posId: string; token: string } | null) {}

  async submit(invoice: FiscalInvoiceDocument): Promise<FiscalSubmission> {
    const request = fiscalRequestPayload(invoice);
    if (!this.credentials) {
      return { outcome: { kind: "retryable", error: "PRA credentials are not configured (.env.example, fiscal section)." }, request, response: null };
    }
    return { outcome: { kind: "retryable", error: "PRA adapter awaits the API specification from PRA registration." }, request, response: null };
  }
}

/** FISCAL_PROVIDER=none: invoices stay queued (and day close stays blocked) until a provider is configured. */
class DisabledFiscalAdapter implements FiscalAdapter {
  readonly name = "none";

  async submit(invoice: FiscalInvoiceDocument): Promise<FiscalSubmission> {
    return { outcome: { kind: "retryable", error: "Fiscal reporting is switched off (FISCAL_PROVIDER=none)." }, request: fiscalRequestPayload(invoice), response: null };
  }
}

let override: FiscalAdapter | null = null;
let fromConfig: FiscalAdapter | null = null;

/** The configured adapter (one per process: the mock keeps its failure counters). */
export function getFiscalAdapter(): FiscalAdapter {
  if (override) return override;
  if (!fromConfig) {
    const { provider, pra } = config.fiscal;
    fromConfig = provider === "pra" ? new PraFiscalAdapter(pra) : provider === "none" ? new DisabledFiscalAdapter() : new MockFiscalAdapter();
  }
  return fromConfig;
}

/** Tests: use this adapter instead of the configured one (null restores it). */
export function setFiscalAdapterForTests(adapter: FiscalAdapter | null): void {
  override = adapter;
}
