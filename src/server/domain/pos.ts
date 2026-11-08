import type { OrderType, PaymentMethod } from "@/shared/contract/enums";
import type { RestaurantSettings } from "@/shared/contract/settings";
import { POS_TENDER_METHOD, type PosTenderInput } from "@/shared/pos";
import { dec, sumMoney } from "@/shared/money";
import { calculatePricing, PricingError, type PricingLineInput, type PricingResult } from "./pricing";

/**
 * POS rules shared by the till (browser, works offline) and the server (authoritative). Pure: the till imports this
 * file, so both sides price a ticket with the SAME engine (`calculatePricing`, channel "pos") — never a copy.
 */

/** A ticket's totals at the till. `paymentMethod` null = not paid yet (priced at the cash rate, the higher one). */
export function priceTicket(
  lines: PricingLineInput[],
  orderType: OrderType,
  settings: RestaurantSettings,
  paymentMethod: PaymentMethod | null = null,
): PricingResult {
  return calculatePricing({ lines, orderType, settings, paymentMethod, channel: "pos" });
}

/** Methods taxed at the card rate at the till (taxRateForPaymentMethod, channel "pos"). */
const REDUCED_RATE_METHODS: readonly PaymentMethod[] = ["card_terminal", "card_online", "wallet", "bank_transfer"];

/**
 * The payment method an invoice is issued (and taxed) under. A sale may be split over several tenders, but they
 * must share one tax rate: cash is taxed at the cash rate and card/digital at the card rate, so cash + card would
 * need a split tax computation PRA's rules (and the client's accountant) have not defined. Refused, not guessed.
 */
export function saleTaxMethod(tenders: readonly Pick<PosTenderInput, "tender">[]): PaymentMethod {
  if (tenders.length === 0) throw new PricingError("VALIDATION_ERROR", "Add a payment.");
  const methods = tenders.map((tender) => POS_TENDER_METHOD[tender.tender].method);
  const reduced = methods.map((method) => REDUCED_RATE_METHODS.includes(method));
  if (reduced.some((value) => value !== reduced[0])) {
    throw new PricingError("VALIDATION_ERROR", "Cash and card/digital are taxed at different rates: take the whole bill one way.");
  }
  return methods[0]!;
}

/**
 * Tenders must add up to the total exactly; a cash tender's `tendered` (handed over) must cover its amount, and
 * only cash can give change. Returns the change due on the cash tender (0.00 when none).
 */
export function validateTenders(total: string, tenders: readonly PosTenderInput[]): string {
  const paid = sumMoney(tenders.map((tender) => tender.amount));
  if (!paid.equals(dec(total))) {
    throw new PricingError("VALIDATION_ERROR", `Payments (${paid.toFixed(2)}) must equal the total (${dec(total).toFixed(2)}).`);
  }
  let change = dec(0);
  for (const tender of tenders) {
    if (dec(tender.amount).lessThanOrEqualTo(0)) throw new PricingError("VALIDATION_ERROR", "A payment must be more than zero.");
    if (tender.tendered == null) continue;
    if (tender.tender !== "cash") throw new PricingError("VALIDATION_ERROR", "Only cash can be tendered with change.");
    if (dec(tender.tendered).lessThan(dec(tender.amount))) {
      throw new PricingError("VALIDATION_ERROR", "Cash received is less than the amount due.");
    }
    change = change.plus(dec(tender.tendered).minus(dec(tender.amount)));
  }
  return change.toFixed(2);
}

/** A sale's total in the till's own words, for the fiscal QR printed offline (before the authority answers). */
export function localInvoiceQrPayload(fields: {
  invoiceNumber: string;
  ntn: string | null;
  issuedAt: string;
  total: string;
  tax: string;
}): string {
  return [`INV:${fields.invoiceNumber}`, `NTN:${fields.ntn ?? "-"}`, `DT:${fields.issuedAt}`, `TOT:${fields.total}`, `TAX:${fields.tax}`].join("|");
}
