"use client";

import { CheckCircle2, Clock, Plus, Printer } from "lucide-react";
import { dec } from "@/shared/money";
import type { ReceiptDocument } from "@/shared/pos-receipt";
import { Receipt } from "./receipt";
import { rs } from "./format";

/** Screen 3 — after a sale: the 80mm receipt (already sent to the printer), reprint, next order. */
export function ReceiptScreen({ doc, onReprint, onNewOrder }: { doc: ReceiptDocument; onReprint: () => void; onNewOrder: () => void }) {
  const change = doc.change && dec(doc.change).greaterThan(0) ? doc.change : null;
  return (
    <div className="mx-auto grid w-full max-w-[1000px] gap-5 px-3 pb-10 pt-4 sm:px-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start lg:px-6">
      <section className="order-2 flex flex-col gap-4 rounded-[12px] border border-[var(--pos-line)] bg-white p-5 md:order-1">
        <div className="flex items-center gap-3">
          <CheckCircle2 className="size-8 shrink-0 text-[var(--pos-green)]" aria-hidden />
          <div>
            <h1 className="text-[18px] font-semibold">{doc.kind === "credit_note" ? "Refund issued" : "Payment complete"}</h1>
            <p className="text-[13px] text-[var(--pos-muted)]">
              Invoice {doc.invoiceNumber} · {rs(doc.total)}
            </p>
          </div>
        </div>
        {change ? (
          <div className="rounded-[var(--pos-radius)] bg-[var(--pos-green-tint)] px-4 py-3">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-[var(--pos-green)]">Change to give</p>
            <p className="text-[30px] font-bold tabular-nums text-[var(--pos-green)]">{rs(change)}</p>
          </div>
        ) : null}
        <p className="flex items-center gap-2 text-[13px]">
          {doc.authorityInvoiceNumber ? (
            <>
              <CheckCircle2 className="size-4 text-[var(--pos-green)]" aria-hidden />
              PRA invoice {doc.authorityInvoiceNumber}
            </>
          ) : (
            <>
              <Clock className="size-4 text-[var(--pos-amber)]" aria-hidden />
              PRA number pending — it is reported automatically; reprint to show it once it arrives.
            </>
          )}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onReprint} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--pos-radius)] border border-[var(--pos-line-strong)] text-[14px] font-semibold">
            <Printer className="size-4" aria-hidden />
            Reprint
          </button>
          <button type="button" onClick={onNewOrder} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--pos-radius)] bg-[var(--pos-green)] text-[14px] font-semibold text-white">
            <Plus className="size-4" aria-hidden />
            New order
          </button>
        </div>
      </section>
      <div className="order-1 flex justify-center rounded-[12px] bg-[#e6e2d8] p-3 sm:p-4 md:order-2">
        <div className="w-full max-w-[300px] bg-white p-3 shadow-[var(--pos-shadow)]">
          <Receipt doc={doc} />
        </div>
      </div>
    </div>
  );
}
