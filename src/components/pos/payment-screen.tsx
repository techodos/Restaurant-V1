"use client";

import { useState } from "react";
import { ArrowLeft, Check, Loader2, WifiOff } from "lucide-react";
import { dec } from "@/shared/money";
import { POS_ORDER_TYPE_LABELS, POS_TENDER_METHOD, changeDue, quickCashAmounts, type PosBootstrap, type PosTender } from "@/shared/pos";
import { receiptRate } from "@/shared/pos-receipt";
import { rs } from "./format";
import { ticketPricing, type Ticket } from "./ticket";

const METHODS: { id: "cash" | "card" | "wallet" | "raast"; title: string; hint: string }[] = [
  { id: "cash", title: "Cash", hint: "Count and give change" },
  { id: "card", title: "Card", hint: "Bank POS machine at the counter" },
  { id: "wallet", title: "JazzCash / Easypaisa", hint: "Scan to pay" },
  { id: "raast", title: "Raast QR", hint: "Bank app scan" },
];

/** Screen 2 — take payment. The tax rate follows the method (settings.tax), so the total is re-priced on every switch. */
export function PaymentScreen({
  boot,
  ticket,
  online,
  onBack,
  onComplete,
}: {
  boot: PosBootstrap;
  ticket: Ticket;
  online: boolean;
  onBack: () => void;
  onComplete: (input: { tender: PosTender; tendered: string | null }) => Promise<void>;
}) {
  const [method, setMethod] = useState<(typeof METHODS)[number]["id"]>("cash");
  const [wallet, setWallet] = useState<"jazzcash" | "easypaisa">("jazzcash");
  const tender: PosTender = method === "wallet" ? wallet : method;
  const pricing = ticketPricing(ticket, boot.settings, POS_TENDER_METHOD[tender].method)!;
  const quick = quickCashAmounts(pricing.total);
  const [received, setReceived] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);

  const cashReceived = method === "cash" ? (custom.trim() ? dec(Number(custom) || 0).toFixed(2) : (received ?? quick[1] ?? pricing.total)) : null;
  const short = cashReceived !== null && dec(cashReceived).lessThan(dec(pricing.total));
  const title = ticket.orderType === "dine_in" && ticket.tableNumber ? `Table ${ticket.tableNumber}` : POS_ORDER_TYPE_LABELS[ticket.orderType];

  async function complete() {
    if (busy || short) return;
    setBusy(true);
    try {
      await onComplete({ tender, tendered: cashReceived });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1200px] px-3 pb-10 pt-3 sm:px-4 lg:px-6">
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[12px] border border-[var(--pos-line)] bg-white px-3 py-2.5">
        <button type="button" onClick={onBack} className="inline-flex min-h-10 items-center gap-1.5 rounded-[8px] border border-[var(--pos-line)] px-3 text-[13px] font-medium">
          <ArrowLeft className="size-4" aria-hidden />
          Back to order
        </button>
        <h1 className="text-[15px] font-semibold">
          Take payment · {title}
          {ticket.orderNumber ? ` · Order #${ticket.orderNumber}` : ""}
        </h1>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start">
        <section aria-label="Order summary" className="rounded-[12px] border border-[var(--pos-line)] bg-white p-4 sm:p-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pos-muted)]">Order summary</h2>
          <ul className="mt-3 flex flex-col gap-1.5 text-[13px]">
            {ticket.lines.map((line) => (
              <li key={line.clientLineId} className="flex justify-between gap-3">
                <span className="min-w-0">
                  {line.quantity} × {line.name}
                  {line.variantName ? ` (${line.variantName})` : ""}
                </span>
                <span className="shrink-0 tabular-nums">{rs(dec(line.unitPrice).plus(dec(line.addonsTotal)).times(line.quantity).toFixed(2))}</span>
              </li>
            ))}
          </ul>
          <dl className="mt-4 flex flex-col gap-1 border-t border-[var(--pos-line)] pt-3 text-[13px] text-[var(--pos-muted)]">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd className="tabular-nums">{rs(pricing.subtotal)}</dd>
            </div>
            {dec(pricing.serviceFee).greaterThan(0) ? (
              <div className="flex justify-between">
                <dt>Service charge</dt>
                <dd className="tabular-nums">{rs(pricing.serviceFee)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between text-[var(--pos-green)]">
              <dt>
                {boot.receipt.taxLabel} (PRA) {receiptRate(pricing.taxRate)}%
              </dt>
              <dd className="tabular-nums">{rs(pricing.tax)}</dd>
            </div>
            <p className="text-[11px]">{method === "cash" ? "Cash sales are taxed at the standard restaurant rate." : "Card and digital payments are taxed at the reduced rate."}</p>
          </dl>
          <div className="mt-4 flex items-baseline justify-between">
            <span className="text-[20px] font-semibold">Total</span>
            <span className="text-[26px] font-bold tabular-nums">{rs(pricing.total)}</span>
          </div>
        </section>

        <section aria-label="Payment" className="rounded-[12px] border border-[var(--pos-line)] bg-white p-4 sm:p-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--pos-muted)]">Payment method</h2>
          <div role="radiogroup" aria-label="Payment method" className="mt-3 grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
            {METHODS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="radio"
                aria-checked={method === entry.id}
                onClick={() => setMethod(entry.id)}
                className={`min-h-[4.25rem] rounded-[var(--pos-radius)] border p-3 text-left transition-colors ${
                  method === entry.id ? "border-[var(--pos-green)] bg-[var(--pos-green-tint)]" : "border-[var(--pos-line)] hover:border-[var(--pos-line-strong)]"
                }`}
              >
                <span className="block text-[14px] font-semibold">{entry.title}</span>
                <span className="block text-[12px] text-[var(--pos-muted)]">{entry.hint}</span>
              </button>
            ))}
          </div>

          {method === "wallet" ? (
            <div role="radiogroup" aria-label="Wallet" className="mt-3 flex gap-2">
              {(["jazzcash", "easypaisa"] as const).map((entry) => (
                <button
                  key={entry}
                  type="button"
                  role="radio"
                  aria-checked={wallet === entry}
                  onClick={() => setWallet(entry)}
                  className={`min-h-10 flex-1 rounded-[8px] border text-[13px] font-medium ${wallet === entry ? "border-[var(--pos-green)] bg-[var(--pos-green)] text-white" : "border-[var(--pos-line)]"}`}
                >
                  {entry === "jazzcash" ? "JazzCash" : "Easypaisa"}
                </button>
              ))}
            </div>
          ) : null}

          {method === "cash" ? (
            <>
              <h3 className="mt-5 text-[11px] font-semibold uppercase tracking-wide text-[var(--pos-muted)]">Cash received</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {quick.map((amount, index) => {
                  const active = !custom.trim() && (received ?? quick[1] ?? pricing.total) === amount;
                  return (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => {
                        setReceived(amount);
                        setCustom("");
                      }}
                      className={`min-h-11 rounded-[8px] border px-3.5 text-[13px] font-semibold tabular-nums ${active ? "border-[var(--pos-green)] bg-[var(--pos-green)] text-white" : "border-[var(--pos-line-strong)]"}`}
                    >
                      {index === 0 ? `Exact ${rs(amount)}` : rs(amount)}
                    </button>
                  );
                })}
                <label className="min-w-[8rem] flex-1">
                  <span className="sr-only">Other amount</span>
                  <input
                    inputMode="decimal"
                    value={custom}
                    onChange={(event) => setCustom(event.target.value.replace(/[^\d.]/g, ""))}
                    placeholder="Other amount"
                    className="min-h-11 w-full rounded-[8px] border border-[var(--pos-line-strong)] px-3 text-[14px] tabular-nums focus:border-[var(--pos-green)] focus:outline-none"
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-[var(--pos-radius)] border border-[var(--pos-line)] bg-[#faf9f6] px-4 py-3">
                <span className="text-[13px] text-[var(--pos-muted)]">Received {rs(cashReceived)}</span>
                <span className={`text-[17px] font-bold tabular-nums ${short ? "text-[var(--pos-red)]" : "text-[var(--pos-green)]"}`}>
                  {short ? `Short ${rs(dec(pricing.total).minus(dec(cashReceived!)).toFixed(2))}` : `Change ${rs(changeDue(pricing.total, cashReceived!))}`}
                </span>
              </div>
            </>
          ) : (
            <p className="mt-4 rounded-[var(--pos-radius)] bg-[#faf9f6] px-4 py-3 text-[13px] text-[var(--pos-muted)]">
              Take {rs(pricing.total)} on the {method === "card" ? "card machine" : method === "raast" ? "customer's bank app (Raast)" : wallet === "jazzcash" ? "JazzCash app" : "Easypaisa app"}, then complete once it shows as paid.
            </p>
          )}

          <button
            type="button"
            disabled={busy || short}
            onClick={complete}
            className="mt-5 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-[var(--pos-radius)] bg-[var(--pos-green)] px-4 text-[15px] font-semibold text-white transition-colors hover:bg-[var(--pos-green-strong)] disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {busy ? "Recording payment…" : "Complete payment · print receipt"}
          </button>
          <p className="mt-2 flex items-center gap-1.5 text-[12px] text-[var(--pos-muted)]">
            {online ? <Check className="size-3.5 text-[var(--pos-green)]" aria-hidden /> : <WifiOff className="size-3.5 text-[var(--pos-amber)]" aria-hidden />}
            {online ? "Reported to PRA for the invoice number" : "Offline: saved on this till; the PRA number is added when it reconnects"}
          </p>
        </section>
      </div>
    </div>
  );
}
