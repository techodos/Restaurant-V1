import type { Money } from "@/shared/contract/models";
import { dec } from "@/shared/money";
import type { ReceiptLine } from "@/shared/pos";

/**
 * The 80mm receipt as data (SKILL.md §43). Built once per sale on the till; every printer renders THIS document:
 * the browser printer (components/pos/receipt.tsx + an 80mm @page stylesheet) today, an ESC/POS encoder over
 * WebUSB/Web Bluetooth later (it would print `receiptTextLines(doc, 48)` with the QR as a raster/QR command).
 */
export interface ReceiptDocument {
  kind: "sale" | "credit_note";
  businessName: string;
  branchName: string;
  branchAddress: string;
  branchPhone: string | null;
  ntn: string | null;
  pntn: string | null;
  invoiceNumber: string;
  /** the authority's (PRA) number; null while it is still being reported — the receipt says so */
  authorityInvoiceNumber: string | null;
  originalInvoiceNumber: string | null;
  orderNumber: string | null;
  /** already formatted in the restaurant's time zone: "07-11-2026 14:32" */
  issuedAtText: string;
  cashier: string;
  orderTypeLabel: string;
  tableNumber: string | null;
  lines: ReceiptLine[];
  subtotal: Money;
  serviceFee: Money;
  discount: Money;
  taxLabel: string;
  /** percent, e.g. "16" */
  taxRate: string;
  tax: Money;
  total: Money;
  payments: { label: string; amount: Money }[];
  tendered: Money | null;
  change: Money | null;
  /** what the QR encodes: the authority's payload once known, else the till's own (works offline) */
  qrPayload: string;
  footerNote: string | null;
  currencyCode: string;
}

/** Amount for a receipt column: "2,366" for whole rupees, "2,366.40" otherwise (no symbol). */
export function receiptAmount(value: Money): string {
  const amount = dec(value);
  const whole = amount.isInteger();
  return amount.toNumber().toLocaleString("en-PK", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
}

/** Tax rate for print: "16", "8", "7.5". */
export function receiptRate(rate: string): string {
  return dec(rate).toDecimalPlaces(2).toString();
}

/** A date in the restaurant's zone as the receipt prints it: 07-11-2026 14:32. */
export function receiptDateTime(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("day")}-${part("month")}-${part("year")} ${part("hour")}:${part("minute")}`;
}

function row(left: string, right: string, columns: number): string {
  const space = Math.max(1, columns - left.length - right.length);
  return left.length + right.length + 1 > columns ? `${left.slice(0, columns - right.length - 1)} ${right}` : `${left}${" ".repeat(space)}${right}`;
}

function center(text: string, columns: number): string {
  if (text.length >= columns) return text.slice(0, columns);
  return `${" ".repeat(Math.floor((columns - text.length) / 2))}${text}`;
}

/**
 * The receipt as fixed-width text (48 columns = 80mm at Font A, 42 on many printers). This is what an ESC/POS
 * driver sends line by line; the browser receipt shows the same fields in the same order.
 */
export function receiptTextLines(doc: ReceiptDocument, columns = 48): string[] {
  const rule = "-".repeat(columns);
  const out: string[] = [];
  out.push(center(doc.businessName.toUpperCase(), columns));
  if (doc.branchAddress) out.push(center(doc.branchAddress, columns));
  if (doc.branchPhone) out.push(center(`Tel: ${doc.branchPhone}`, columns));
  out.push(center(`PNTN: ${doc.pntn ?? "-"}   NTN: ${doc.ntn ?? "-"}`, columns));
  if (doc.kind === "credit_note") out.push(center("*** CREDIT NOTE ***", columns));
  out.push(rule);
  out.push(row("Invoice #", doc.invoiceNumber, columns));
  out.push(row("PRA Invoice #", doc.authorityInvoiceNumber ?? "pending", columns));
  if (doc.originalInvoiceNumber) out.push(row("Against invoice", doc.originalInvoiceNumber, columns));
  out.push(row("Date", doc.issuedAtText, columns));
  out.push(row("Cashier", doc.cashier, columns));
  out.push(row(doc.orderTypeLabel, doc.tableNumber ? `Table ${doc.tableNumber}` : (doc.orderNumber ?? ""), columns));
  out.push(rule);
  out.push(row("Item", "Qty    Amount", columns));
  for (const line of doc.lines) {
    const amount = receiptAmount(line.lineTotal).padStart(9);
    const qty = String(line.quantity).padStart(3);
    out.push(row(line.variant ? `${line.name} (${line.variant})` : line.name, `${qty}${amount}`, columns));
  }
  out.push(rule);
  out.push(row("Amount before tax", receiptAmount(doc.subtotal), columns));
  if (dec(doc.serviceFee).greaterThan(0)) out.push(row("Service charge", receiptAmount(doc.serviceFee), columns));
  if (dec(doc.discount).greaterThan(0)) out.push(row("Discount", `-${receiptAmount(doc.discount)}`, columns));
  out.push(row(`${doc.taxLabel} ${receiptRate(doc.taxRate)}% (PRA)`, receiptAmount(doc.tax), columns));
  out.push(row(`TOTAL (${doc.currencyCode === "PKR" ? "Rs" : doc.currencyCode})`, receiptAmount(doc.total), columns));
  for (const payment of doc.payments) out.push(row(`Paid: ${payment.label}`, receiptAmount(payment.amount), columns));
  if (doc.change && dec(doc.change).greaterThan(0)) out.push(row("Change", receiptAmount(doc.change), columns));
  out.push(rule);
  out.push(center("Scan the QR to verify this invoice with the", columns));
  out.push(center("Punjab Revenue Authority.", columns));
  out.push(rule);
  out.push(center(doc.footerNote || "Thank you. Please visit again.", columns));
  return out;
}
