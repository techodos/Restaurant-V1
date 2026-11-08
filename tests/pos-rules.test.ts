import { describe, expect, it } from "vitest";
import { restaurantSettingsSchema } from "@/shared/contract/settings";
import { calculatePricing, taxRateForPaymentMethod } from "@/server/domain/pricing";
import { priceTicket, saleTaxMethod, validateTenders } from "@/server/domain/pos";
import { changeDue, formatInvoiceNumber, quickCashAmounts } from "@/shared/pos";
import { MockFiscalAdapter, fiscalRequestPayload } from "@/server/integrations/fiscal";
import { fiscalRetryDelayMinutes } from "@/server/repositories/pos";
import type { FiscalInvoiceDocument } from "@/shared/pos";

/** In-store POS rules that run in the browser (offline) AND on the server: one engine, no copies. SKILL.md §43. */

const settings = restaurantSettingsSchema.parse({
  tax: { enabled: true, rate: 5, byPaymentMethod: { card: { rate: 8 }, cashOnDelivery: { rate: 16 } } },
  // the storefront's minimum order must not block a counter sale
  ordering: { minimumOrderAmount: 5000 },
});
const lines = [
  { unitPrice: "450.00", addonsTotal: "0", quantity: 2 },
  { unitPrice: "250.00", addonsTotal: "0", quantity: 1 },
  { unitPrice: "890.00", addonsTotal: "0", quantity: 1 },
];

describe("POS pricing (calculatePricing, channel pos)", () => {
  it("taxes cash at the cash rate and card/digital at the card rate (the design's Rs 2,040 ticket)", () => {
    const cash = priceTicket(lines, "dine_in", settings, "cash");
    expect(cash.subtotal).toBe("2040.00");
    expect(cash.tax).toBe("326.40");
    expect(cash.total).toBe("2366.40");
    for (const method of ["card_terminal", "wallet", "bank_transfer"] as const) {
      const reduced = priceTicket(lines, "dine_in", settings, method);
      expect(reduced.taxRate).toBe("8.0000");
      expect(reduced.tax).toBe("163.20");
      expect(reduced.total).toBe("2203.20");
    }
  });

  it("prices an unpaid ticket at the cash rate (the total can only go down at payment)", () => {
    expect(priceTicket(lines, "pickup", settings, null).taxRate).toBe("16.0000");
  });

  it("ignores the storefront's minimum order and delivery-zone gates at the till", () => {
    expect(() => calculatePricing({ lines, orderType: "pickup", settings })).toThrow();
    expect(priceTicket(lines, "pickup", settings).subtotal).toBe("2040.00");
    expect(priceTicket(lines, "delivery", settings).deliveryFee).toBe("0.00");
  });

  it("leaves the storefront's rates exactly as they were (wallet/cash keep the flat rate on the web)", () => {
    expect(taxRateForPaymentMethod(settings.tax, "wallet").toFixed(0)).toBe("5");
    expect(taxRateForPaymentMethod(settings.tax, "cash").toFixed(0)).toBe("5");
    expect(taxRateForPaymentMethod(settings.tax, "card_terminal").toFixed(0)).toBe("8");
    expect(taxRateForPaymentMethod(settings.tax, "cash_on_delivery").toFixed(0)).toBe("16");
  });

  it("applies the dine-in service fee before tax, like the website", () => {
    const withFee = restaurantSettingsSchema.parse({ ...settings, serviceFee: { dine_in: { enabled: true, rate: 10 } } });
    const pricing = priceTicket(lines, "dine_in", withFee, "cash");
    expect(pricing.serviceFee).toBe("204.00");
    expect(pricing.tax).toBe("359.04");
  });
});

describe("tenders", () => {
  it("names the invoice's method from the tenders and refuses cash + card on one bill", () => {
    expect(saleTaxMethod([{ tender: "cash" }])).toBe("cash");
    expect(saleTaxMethod([{ tender: "jazzcash" }, { tender: "card" }])).toBe("wallet");
    expect(() => saleTaxMethod([{ tender: "cash" }, { tender: "card" }])).toThrow(/different rates/);
    expect(() => saleTaxMethod([])).toThrow();
  });

  it("requires tenders to add up exactly and gives change only on cash", () => {
    const id = "00000000-0000-4000-8000-000000000001";
    expect(validateTenders("2366.40", [{ clientPaymentId: id, tender: "cash", amount: "2366.40", tendered: "2500.00" }])).toBe("133.60");
    expect(() => validateTenders("2366.40", [{ clientPaymentId: id, tender: "cash", amount: "2000.00" }])).toThrow(/must equal/);
    expect(() => validateTenders("100.00", [{ clientPaymentId: id, tender: "cash", amount: "100.00", tendered: "50.00" }])).toThrow(/less than/);
    expect(() => validateTenders("100.00", [{ clientPaymentId: id, tender: "card", amount: "100.00", tendered: "200.00" }])).toThrow(/Only cash/);
  });

  it("offers exact + round notes as quick cash amounts", () => {
    expect(quickCashAmounts("2366.00")).toEqual(["2366.00", "2500.00", "3000.00", "5000.00"]);
    expect(quickCashAmounts("500.00")).toEqual(["500.00", "1000.00", "5000.00"]);
    expect(changeDue("2366.00", "2500.00")).toBe("134.00");
    expect(changeDue("2366.00", "2000.00")).toBe("0.00");
  });

  it("numbers invoices per till", () => {
    expect(formatInvoiceNumber("GUL1", 42)).toBe("GUL1-000042");
  });
});

describe("fiscal adapter (mock)", () => {
  const invoice: FiscalInvoiceDocument = {
    id: "inv-1", restaurantId: "r-1", kind: "sale", invoiceNumber: "GUL1-000001", originalInvoiceNumber: null,
    originalAuthorityInvoiceNumber: null, issuedAt: "2026-11-07T09:32:00.000Z", paymentMethod: "cash", subtotal: "2040.00",
    discount: "0.00", serviceFee: "0.00", taxRate: "16.0000", taxAmount: "326.40", total: "2366.40", currency: "PKR",
    lines: [{ name: "Cappuccino", variant: null, quantity: 2, unitPrice: "450.00", lineTotal: "900.00" }], attempts: 1,
    seller: { name: "Blue Hour", ntn: "1234567-8", pntn: "P1234567-8", branchName: "Gulberg", deviceCode: "GUL1" },
    buyer: { name: "Table 4", phone: null },
  };

  it("answers with a stable authority number and QR payload, and can fail first to exercise retries", async () => {
    const flaky = new MockFiscalAdapter({ failures: 1 });
    expect((await flaky.submit(invoice)).outcome.kind).toBe("retryable");
    const second = await flaky.submit(invoice);
    expect(second.outcome.kind).toBe("synced");
    const again = await new MockFiscalAdapter().submit(invoice);
    expect(again.outcome).toEqual(second.outcome);
    expect(fiscalRequestPayload(invoice)).toMatchObject({ invoiceNumber: "GUL1-000001", totalBillAmount: "2366.40", totalTaxCharged: "326.40" });
  });

  it("backs off 1, 5, 15, then 60 minutes", () => {
    expect([1, 2, 3, 4, 9].map(fiscalRetryDelayMinutes)).toEqual([1, 5, 15, 60, 60]);
  });
});
