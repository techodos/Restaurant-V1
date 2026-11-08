import { dec } from "@/shared/money";
import type { ZReport } from "@/shared/pos";
import { receiptAmount, receiptDateTime, receiptRate, type ReceiptDocument } from "@/shared/pos-receipt";
import { QrCode } from "./qr-code";

/**
 * The 80mm receipt (screen preview and print). Fields and order follow shared/pos-receipt.ts#receiptTextLines, which
 * an ESC/POS printer would print. Styling: `.pos-receipt` in app/pos/pos.css (monospace, 72mm printable width).
 */

function Row({ left, right, strong }: { left: string; right: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${strong ? "font-bold" : ""}`}>
      <span className="min-w-0 break-words">{left}</span>
      <span className="shrink-0 text-right tabular-nums">{right}</span>
    </div>
  );
}

const Rule = () => <div className="pos-receipt-rule" aria-hidden />;

export function Receipt({ doc }: { doc: ReceiptDocument }) {
  const currency = doc.currencyCode === "PKR" ? "Rs" : doc.currencyCode;
  return (
    <article className="pos-receipt" aria-label={`Receipt ${doc.invoiceNumber}`}>
      <header className="text-center">
        <p className="text-[1.1em] font-bold uppercase">{doc.businessName}</p>
        {doc.branchAddress ? <p>{doc.branchAddress}</p> : null}
        {doc.branchPhone ? <p>Tel: {doc.branchPhone}</p> : null}
        <p>
          PNTN: {doc.pntn ?? "-"} &nbsp; NTN: {doc.ntn ?? "-"}
        </p>
        {doc.kind === "credit_note" ? <p className="mt-1 font-bold">*** CREDIT NOTE ***</p> : null}
      </header>
      <Rule />
      <Row left="Invoice #" right={doc.invoiceNumber} />
      <Row left="PRA Invoice #" right={doc.authorityInvoiceNumber ?? "pending"} />
      {doc.originalInvoiceNumber ? <Row left="Against invoice" right={doc.originalInvoiceNumber} /> : null}
      <Row left="Date" right={doc.issuedAtText} />
      <Row left="Cashier" right={doc.cashier} />
      <Row left={doc.orderTypeLabel} right={doc.tableNumber ? `Table ${doc.tableNumber}` : (doc.orderNumber ?? "")} />
      <Rule />
      <div className="flex justify-between gap-2 font-bold">
        <span>Item</span>
        <span className="flex gap-3">
          <span>Qty</span>
          <span className="w-[6ch] text-right">Amount</span>
        </span>
      </div>
      {doc.lines.map((line, index) => (
        <div key={index} className="flex justify-between gap-2">
          <span className="min-w-0 break-words">
            {line.name}
            {line.variant ? ` (${line.variant})` : ""}
          </span>
          <span className="flex shrink-0 gap-3 tabular-nums">
            <span className="w-[3ch] text-right">{line.quantity}</span>
            <span className="w-[6ch] text-right">{receiptAmount(line.lineTotal)}</span>
          </span>
        </div>
      ))}
      <Rule />
      <Row left="Amount before tax" right={receiptAmount(doc.subtotal)} />
      {dec(doc.serviceFee).greaterThan(0) ? <Row left="Service charge" right={receiptAmount(doc.serviceFee)} /> : null}
      {dec(doc.discount).greaterThan(0) ? <Row left="Discount" right={`-${receiptAmount(doc.discount)}`} /> : null}
      <Row left={`${doc.taxLabel} ${receiptRate(doc.taxRate)}% (PRA)`} right={receiptAmount(doc.tax)} />
      <div className="mt-1 text-[1.15em]">
        <Row left={`TOTAL (${currency})`} right={receiptAmount(doc.total)} strong />
      </div>
      {doc.payments.map((payment, index) => (
        <Row key={index} left={`Paid: ${payment.label}`} right={receiptAmount(payment.amount)} />
      ))}
      {doc.change && dec(doc.change).greaterThan(0) ? <Row left="Change" right={receiptAmount(doc.change)} /> : null}
      <Rule />
      <div className="flex flex-col items-center gap-1 py-1">
        <QrCode value={doc.qrPayload} label="Fiscal invoice QR code" className="pos-receipt-qr" />
        <p className="text-center">Scan the QR to verify this invoice with the Punjab Revenue Authority.</p>
      </div>
      <Rule />
      <footer className="text-center">
        <p className="font-bold">{doc.footerNote || "Thank you. Please visit again."}</p>
        <p>Powered by TechOdos POS</p>
      </footer>
    </article>
  );
}

export function ZReportSlip({
  report,
  header,
}: {
  report: ZReport;
  header: { businessName: string; branchName: string; tillName: string; shiftLabel: string; timezone: string };
}) {
  return (
    <article className="pos-receipt" aria-label="Z-report">
      <header className="text-center">
        <p className="text-[1.1em] font-bold uppercase">{header.businessName}</p>
        <p>{header.branchName}</p>
        <p className="mt-1 font-bold">Z-REPORT (DAY CLOSE)</p>
        <p>
          {header.tillName} · {header.shiftLabel}
        </p>
        <p>{receiptDateTime(report.generatedAt, header.timezone)}</p>
      </header>
      <Rule />
      <Row left="Orders" right={String(report.orders)} />
      <Row left="Invoices" right={String(report.salesCount)} />
      <Row left="Credit notes" right={String(report.creditNotes)} />
      <Row left="Sales before tax" right={receiptAmount(report.netSales)} />
      <Row left="Sales tax collected" right={receiptAmount(report.taxCollected)} />
      <Row left="Total takings" right={receiptAmount(report.totalTakings)} strong />
      <Rule />
      {report.tenders.map((tender) => (
        <Row key={tender.tender} left={tender.label} right={receiptAmount(tender.net)} />
      ))}
      <Rule />
      <Row left="Opening float" right={receiptAmount(report.openingFloat)} />
      <Row left="Cash sales" right={receiptAmount(report.cashSales)} />
      {dec(report.cashRefunds).greaterThan(0) ? <Row left="Cash refunds" right={`-${receiptAmount(report.cashRefunds)}`} /> : null}
      <Row left="Expected in drawer" right={receiptAmount(report.expectedCash)} />
      {report.countedCash ? <Row left="Counted cash" right={receiptAmount(report.countedCash)} /> : null}
      {report.difference ? <Row left="Difference" right={receiptAmount(report.difference)} strong /> : null}
      <Rule />
      <Row left="PRA reported" right={`${report.fiscal.synced}/${report.salesCount + report.creditNotes}`} />
    </article>
  );
}
