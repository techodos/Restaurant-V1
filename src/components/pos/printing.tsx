"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { ZReport } from "@/shared/pos";
import type { ReceiptDocument } from "@/shared/pos-receipt";
import { Receipt, ZReportSlip } from "./receipt";

/**
 * How the till prints (SKILL.md §43). Every printer takes the same job; today the browser prints it on the client's
 * own thermal printer through an 80mm @page stylesheet (app/pos/pos.css). An ESC/POS printer over WebUSB / Web
 * Bluetooth is a second `ReceiptPrinter` that encodes the same ReceiptDocument (shared/pos-receipt.ts
 * #receiptTextLines + a QR command) and is chosen here instead — nothing else on the till changes.
 */
export type PrintJob =
  | { kind: "receipt"; doc: ReceiptDocument }
  | { kind: "z-report"; report: ZReport; header: { businessName: string; branchName: string; tillName: string; shiftLabel: string; timezone: string } };

export interface ReceiptPrinter {
  readonly name: string;
  print(job: PrintJob): Promise<void>;
}

const PrinterContext = createContext<ReceiptPrinter | null>(null);

export function usePrinter(): ReceiptPrinter {
  const printer = useContext(PrinterContext);
  if (!printer) throw new Error("usePrinter outside <BrowserPrinterProvider>");
  return printer;
}

/**
 * The browser printer: renders the job into a print-only area (hidden on screen), then window.print(). The
 * stylesheet hides everything else when printing and sizes the page to 80mm, so the system dialog goes straight
 * to the receipt printer (set it as the default printer and enable kiosk printing for a silent print).
 */
export function BrowserPrinterProvider({ children }: { children: ReactNode }) {
  const [job, setJob] = useState<PrintJob | null>(null);
  const pending = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!job || !pending.current) return;
    const done = pending.current;
    pending.current = null;
    // two frames: the print area has rendered (and its QR SVG laid out) before the dialog snapshots the page
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        window.print();
        done();
      }),
    );
  }, [job]);

  const print = useCallback(
    (next: PrintJob) =>
      new Promise<void>((resolve) => {
        pending.current = resolve;
        setJob({ ...next });
      }),
    [],
  );

  return (
    <PrinterContext.Provider value={{ name: "browser", print }}>
      {children}
      <div className="pos-print-area" aria-hidden>
        {job?.kind === "receipt" ? <Receipt doc={job.doc} /> : null}
        {job?.kind === "z-report" ? <ZReportSlip report={job.report} header={job.header} /> : null}
      </div>
    </PrinterContext.Provider>
  );
}
