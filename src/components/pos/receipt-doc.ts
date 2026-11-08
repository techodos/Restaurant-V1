import type { Money } from "@/shared/contract/models";
import { dec } from "@/shared/money";
import { POS_ORDER_TYPE_LABELS, POS_TENDER_LABELS, type PosBootstrap, type PosDevice, type PosTender } from "@/shared/pos";
import { receiptDateTime, type ReceiptDocument } from "@/shared/pos-receipt";
import { localInvoiceQrPayload } from "@/server/domain/pos";
import type { PricingResult } from "@/server/domain/pricing";
import type { Ticket } from "./ticket";

/** The receipt for a sale just taken at this till (printed at once; the PRA number is filled in when known). */
export function saleReceipt(input: {
  boot: PosBootstrap;
  device: PosDevice;
  ticket: Ticket;
  pricing: PricingResult;
  invoiceNumber: string;
  issuedAt: string;
  tender: PosTender;
  tendered: Money | null;
  change: Money | null;
}): ReceiptDocument {
  const { boot, device, ticket, pricing } = input;
  const branch = boot.branches.find((candidate) => candidate.id === device.locationId);
  return {
    kind: "sale",
    businessName: boot.receipt.businessName,
    branchName: branch?.name ?? device.locationName,
    branchAddress: branch?.address ?? "",
    branchPhone: branch?.phone ?? null,
    ntn: boot.receipt.ntn,
    pntn: boot.receipt.pntn,
    invoiceNumber: input.invoiceNumber,
    authorityInvoiceNumber: null,
    originalInvoiceNumber: null,
    orderNumber: ticket.orderNumber,
    issuedAtText: receiptDateTime(input.issuedAt, boot.restaurant.timezone),
    cashier: boot.cashier.name,
    orderTypeLabel: POS_ORDER_TYPE_LABELS[ticket.orderType],
    tableNumber: ticket.orderType === "dine_in" ? ticket.tableNumber : null,
    lines: ticket.lines.map((line) => ({
      name: line.addonNames.length ? `${line.name} + ${line.addonNames.join(", ")}` : line.name,
      variant: line.variantName,
      quantity: line.quantity,
      unitPrice: dec(line.unitPrice).plus(dec(line.addonsTotal)).toFixed(2),
      lineTotal: dec(line.unitPrice).plus(dec(line.addonsTotal)).times(line.quantity).toFixed(2),
    })),
    subtotal: pricing.subtotal,
    serviceFee: pricing.serviceFee,
    discount: pricing.discount,
    taxLabel: boot.receipt.taxLabel,
    taxRate: pricing.taxRate,
    tax: pricing.tax,
    total: pricing.total,
    payments: [{ label: POS_TENDER_LABELS[input.tender], amount: pricing.total }],
    tendered: input.tendered,
    change: input.change,
    qrPayload: localInvoiceQrPayload({ invoiceNumber: input.invoiceNumber, ntn: boot.receipt.pntn ?? boot.receipt.ntn, issuedAt: input.issuedAt, total: pricing.total, tax: pricing.tax }),
    footerNote: boot.receipt.footerNote,
    currencyCode: boot.restaurant.currency,
  };
}

/** A credit note for a refunded sale: the sale's lines and amounts under the credit note's own number. */
export function creditNoteReceipt(sale: ReceiptDocument, input: { invoiceNumber: string; issuedAt: string; timezone: string; cashier: string; authorityInvoiceNumber: string | null; qrPayload: string | null }): ReceiptDocument {
  return {
    ...sale,
    kind: "credit_note",
    invoiceNumber: input.invoiceNumber,
    originalInvoiceNumber: sale.invoiceNumber,
    authorityInvoiceNumber: input.authorityInvoiceNumber,
    issuedAtText: receiptDateTime(input.issuedAt, input.timezone),
    cashier: input.cashier,
    payments: sale.payments.map((payment) => ({ label: `Refund ${payment.label}`, amount: payment.amount })),
    tendered: null,
    change: null,
    qrPayload: input.qrPayload ?? `${sale.qrPayload}|CN:${input.invoiceNumber}`,
  };
}
