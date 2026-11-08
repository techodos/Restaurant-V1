"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2, Printer, RefreshCw, RotateCcw } from "lucide-react";
import { dec } from "@/shared/money";
import type { FiscalInvoiceView, PosShift, ZReport } from "@/shared/pos";
import { POS_METHOD_LABELS } from "@/shared/pos";
import { posApi } from "./api";
import { rs } from "./format";

type ShiftInvoice = FiscalInvoiceView & { orderNumber: string; tableNumber: string | null; refunded: boolean };

/**
 * Screen 4 — day close (Z-report): totals by payment method, the cash drawer count against what should be in it,
 * and the close button, refused while anything is unsynced (the till's own queue, or an invoice PRA has not
 * accepted yet — the server checks the latter again when closing).
 */
export function DayCloseScreen({
  shift,
  title,
  canManage,
  online,
  queued,
  onBack,
  onClosed,
  onPrintReport,
  onRefund,
  onReprint,
}: {
  shift: PosShift;
  title: string;
  canManage: boolean;
  online: boolean;
  queued: number;
  onBack: () => void;
  onClosed: (result: { shift: PosShift; report: ZReport }) => void;
  onPrintReport: (report: ZReport) => void;
  onRefund: (invoice: ShiftInvoice, reason: string) => Promise<boolean>;
  onReprint: (invoice: ShiftInvoice) => void;
}) {
  const [report, setReport] = useState<ZReport | null>(null);
  const [invoices, setInvoices] = useState<ShiftInvoice[]>([]);
  const [counted, setCounted] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [refunding, setRefunding] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const result = await posApi<{ report: ZReport; invoices: ShiftInvoice[] }>(`shift/${shift.id}`);
    setLoading(false);
    if (!result.ok) return setError(result.message);
    setError(null);
    setReport(result.data.report);
    setInvoices(result.data.invoices);
  }, [shift.id]);

  useEffect(() => {
    void load();
  }, [load, queued]);

  const unsyncedInvoices = report ? report.fiscal.pending + report.fiscal.failed : 0;
  const countedValid = /^\d+(\.\d{1,2})?$/.test(counted.trim());
  const difference = report && countedValid ? dec(counted).minus(dec(report.expectedCash)) : null;
  const blocked = !online || queued > 0 || unsyncedInvoices > 0;

  async function close() {
    if (!report || !countedValid || blocked) return;
    setClosing(true);
    const result = await posApi<{ shift: PosShift; report: ZReport }>("shift/close", { shiftId: shift.id, countedCash: counted.trim() });
    setClosing(false);
    if (!result.ok) {
      setError(result.message);
      void load();
      return;
    }
    onClosed(result.data);
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] px-3 pb-10 pt-3 sm:px-4 lg:px-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-[var(--pos-line)] bg-white px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={onBack} className="inline-flex min-h-10 items-center gap-1.5 rounded-[8px] border border-[var(--pos-line)] px-3 text-[13px] font-medium">
            <ArrowLeft className="size-4" aria-hidden />
            Back to POS
          </button>
          <h1 className="text-[15px] font-semibold">Day close · {title}</h1>
        </div>
        <button type="button" onClick={() => void load()} className="inline-flex min-h-10 items-center gap-1.5 rounded-[8px] px-3 text-[13px] text-[var(--pos-muted)] hover:text-[var(--pos-ink)]">
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} aria-hidden />
          Refresh
        </button>
      </div>

      {error ? (
        <p role="alert" className="mb-4 rounded-[var(--pos-radius)] bg-[var(--pos-red-tint)] px-4 py-3 text-[13px] text-[var(--pos-red)]">
          {error}
        </p>
      ) : null}

      {!report ? (
        <div className="grid min-h-[40dvh] place-items-center text-[14px] text-[var(--pos-muted)]">
          {loading ? <Loader2 className="size-6 animate-spin" aria-label="Loading" /> : "The report needs a connection."}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Orders" value={String(report.orders)} />
            <Stat label="Sales before tax" value={rs(report.netSales)} />
            <Stat label="Sales tax collected" value={rs(report.taxCollected)} />
            <Stat label="Total takings" value={rs(report.totalTakings)} highlight />
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <section className="rounded-[12px] border border-[var(--pos-line)] bg-white p-4 sm:p-5">
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pos-muted)]">By payment method</h2>
              <dl className="mt-2 divide-y divide-[var(--pos-line)] text-[14px]">
                {report.tenders.map((tender) => (
                  <div key={tender.tender} className="flex justify-between gap-3 py-2.5">
                    <dt>
                      {tender.label}
                      {dec(tender.refunded).greaterThan(0) ? <span className="text-[12px] text-[var(--pos-muted)]"> (refunds {rs(tender.refunded)})</span> : null}
                    </dt>
                    <dd className="font-semibold tabular-nums">{rs(tender.net)}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <section className="rounded-[12px] border border-[var(--pos-line)] bg-white p-4 sm:p-5">
              <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pos-muted)]">Cash drawer</h2>
              <dl className="mt-2 divide-y divide-[var(--pos-line)] text-[14px]">
                <Line label="Opening float" value={rs(report.openingFloat)} />
                <Line label="Cash sales" value={rs(report.cashSales)} />
                {dec(report.cashRefunds).greaterThan(0) ? <Line label="Cash refunds" value={`− ${rs(report.cashRefunds)}`} /> : null}
                <Line label="Expected in drawer" value={rs(report.expectedCash)} />
                <div className="flex items-center justify-between gap-3 py-2">
                  <dt>
                    <label htmlFor="counted-cash">Counted cash</label>
                  </dt>
                  <dd>
                    <input
                      id="counted-cash"
                      inputMode="decimal"
                      value={counted}
                      onChange={(event) => setCounted(event.target.value.replace(/[^\d.]/g, ""))}
                      placeholder="0"
                      className="min-h-11 w-32 rounded-[8px] border border-[var(--pos-line-strong)] px-3 text-right font-semibold tabular-nums focus:border-[var(--pos-green)] focus:outline-none"
                    />
                  </dd>
                </div>
                <div className="flex justify-between gap-3 py-2.5">
                  <dt>Difference</dt>
                  <dd
                    className={`font-semibold tabular-nums ${difference === null ? "text-[var(--pos-muted)]" : difference.isZero() ? "text-[var(--pos-green)]" : "text-[var(--pos-amber)]"}`}
                  >
                    {difference === null ? "—" : difference.isZero() ? "Balanced" : difference.isNegative() ? `− ${rs(difference.abs().toFixed(2))} short` : `+ ${rs(difference.toFixed(2))} over`}
                  </dd>
                </div>
              </dl>
            </section>
          </div>

          <div
            className={`mt-3 flex flex-col gap-3 rounded-[12px] border p-4 sm:flex-row sm:items-center sm:justify-between ${blocked ? "border-[#f0d9b5] bg-[var(--pos-amber-tint)]" : "border-[#c5e3dc] bg-[var(--pos-green-tint)]"}`}
          >
            <div className="text-[13px]">
              <p className="font-semibold">
                {unsyncedInvoices === 0
                  ? `All ${report.fiscal.synced} invoices reported to PRA.`
                  : `${unsyncedInvoices} invoice${unsyncedInvoices === 1 ? "" : "s"} still waiting for PRA.`}
              </p>
              <p className="text-[var(--pos-muted)]">
                {report.fiscal.pending} pending, {report.fiscal.failed} failed
                {queued > 0 ? `, ${queued} sale${queued === 1 ? "" : "s"} not yet sent from this till` : ""}
                {!online ? ", the till is offline" : ""}. Closing is blocked while any invoice is still waiting to sync.
                {report.unpaidOrders > 0 ? ` ${report.unpaidOrders} order${report.unpaidOrders === 1 ? " was" : "s were"} sent to the kitchen but not paid.` : ""}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" onClick={() => onPrintReport({ ...report, countedCash: countedValid ? dec(counted).toFixed(2) : null, difference: difference ? difference.toFixed(2) : null })} className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--pos-radius)] border border-[var(--pos-line-strong)] bg-white px-3 text-[13px] font-semibold">
                <Printer className="size-4" aria-hidden />
                Print Z-report
              </button>
              <button
                type="button"
                disabled={blocked || !countedValid || closing}
                onClick={close}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--pos-radius)] bg-[var(--pos-green)] px-4 text-[13px] font-semibold text-white disabled:opacity-40"
              >
                {closing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Close day
              </button>
            </div>
          </div>

          <section className="mt-5">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--pos-muted)]">Invoices this shift</h2>
            {invoices.length === 0 ? <p className="text-[13px] text-[var(--pos-muted)]">No sales yet.</p> : null}
            <ul className="divide-y divide-[var(--pos-line)] rounded-[12px] border border-[var(--pos-line)] bg-white">
              {invoices.map((invoice) => (
                <li key={invoice.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 text-[13px]">
                    <p className="font-semibold">
                      {invoice.invoiceNumber}
                      {invoice.kind === "credit_note" ? " · credit note" : ""}
                      {invoice.refunded ? " · refunded" : ""}
                    </p>
                    <p className="text-[var(--pos-muted)]">
                      #{invoice.orderNumber}
                      {invoice.tableNumber ? ` · Table ${invoice.tableNumber}` : ""} · {POS_METHOD_LABELS[invoice.paymentMethod] ?? invoice.paymentMethod} ·{" "}
                      {rs(invoice.total)} ·{" "}
                      <span className={invoice.status === "synced" ? "text-[var(--pos-green)]" : "text-[var(--pos-amber)]"}>
                        PRA {invoice.status === "synced" ? invoice.authorityInvoiceNumber : invoice.status}
                      </span>
                    </p>
                    {invoice.lastError && invoice.status !== "synced" ? <p className="text-[12px] text-[var(--pos-red)]">{invoice.lastError}</p> : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => onReprint(invoice)} className="inline-flex min-h-10 items-center gap-1.5 rounded-[8px] border border-[var(--pos-line)] px-3 text-[12px] font-medium">
                      <Printer className="size-3.5" aria-hidden />
                      Reprint
                    </button>
                    {canManage && invoice.kind === "sale" && !invoice.refunded ? (
                      <button
                        type="button"
                        onClick={() => {
                          setRefunding(invoice.id);
                          setReason("");
                        }}
                        className="inline-flex min-h-10 items-center gap-1.5 rounded-[8px] border border-[var(--pos-line)] px-3 text-[12px] font-medium text-[var(--pos-red)]"
                      >
                        <RotateCcw className="size-3.5" aria-hidden />
                        Refund
                      </button>
                    ) : null}
                  </div>
                  {refunding === invoice.id ? (
                    <form
                      className="flex w-full flex-col gap-2 sm:flex-row"
                      onSubmit={async (event) => {
                        event.preventDefault();
                        if (reason.trim().length < 3) return;
                        if (await onRefund(invoice, reason.trim())) {
                          setRefunding(null);
                          void load();
                        }
                      }}
                    >
                      <input
                        autoFocus
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="Reason for the refund"
                        className="min-h-10 flex-1 rounded-[8px] border border-[var(--pos-line-strong)] px-3 text-[14px]"
                      />
                      <button type="submit" disabled={reason.trim().length < 3} className="min-h-10 rounded-[8px] bg-[var(--pos-red)] px-3 text-[13px] font-semibold text-white disabled:opacity-40">
                        Issue credit note
                      </button>
                      <button type="button" onClick={() => setRefunding(null)} className="min-h-10 rounded-[8px] border border-[var(--pos-line)] px-3 text-[13px]">
                        Cancel
                      </button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-[12px] border p-4 ${highlight ? "border-[var(--pos-green)] bg-[var(--pos-green)] text-white" : "border-[var(--pos-line)] bg-white"}`}>
      <p className={`text-[12px] ${highlight ? "text-white/80" : "text-[var(--pos-muted)]"}`}>{label}</p>
      <p className="mt-1 text-[20px] font-bold tabular-nums sm:text-[24px]">{value}</p>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-2.5">
      <dt>{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
