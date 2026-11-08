import { config } from "@/server/config";
import { logger } from "@/server/logger";
import { getFiscalAdapter, type FiscalSubmission } from "@/server/integrations/fiscal";
import { claimDueFiscalInvoices, saveFiscalAttempt } from "@/server/repositories/pos";
import type { FiscalInvoiceDocument } from "@/shared/pos";

/**
 * The fiscal queue (PRA/FBR). Every POS sale is written to fiscal_invoices as `pending` in the sale's own
 * transaction; this service sends them:
 *   - right after the sale (`submitFiscalNow`, the sync route, short timeout so the till can print the number), and
 *   - from the scheduled job (`drainFiscalQueue`, POST /api/internal/fiscal/dispatch) for everything still due:
 *     failures retry after 1, 5, 15, then every 60 minutes until the authority accepts.
 * Claiming takes a lease (`for update skip locked` + locked_until), so the route and the job never send one
 * invoice at the same time, and a crashed worker's invoices are picked up again after the lease.
 * Never throws: a failed send is a retry, never a failed sale.
 */

export interface FiscalDispatchSummary {
  claimed: number;
  synced: number;
  failed: number;
}

async function submitOne(invoice: FiscalInvoiceDocument, timeoutMs: number): Promise<"synced" | "failed"> {
  const adapter = getFiscalAdapter();
  const started = Date.now();
  let submission: FiscalSubmission;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      submission = await Promise.race([
        adapter.submit(invoice, controller.signal),
        new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(new Error(`timed out after ${timeoutMs} ms`)))),
      ]);
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    submission = {
      outcome: { kind: "retryable", error: error instanceof Error ? error.message : "submit failed" },
      request: null,
      response: null,
    };
  }
  try {
    await saveFiscalAttempt(invoice, {
      adapter: adapter.name,
      outcome: submission.outcome,
      request: submission.request,
      response: submission.response,
      durationMs: Date.now() - started,
    });
  } catch (error) {
    // the lease expires and the invoice is claimed again; the authority must accept a repeat of the same number
    logger.error("fiscal", `could not save the result for ${invoice.invoiceNumber}`, error);
    return "failed";
  }
  if (submission.outcome.kind !== "synced") {
    logger.warn("fiscal", `${invoice.invoiceNumber} not accepted (${submission.outcome.kind}): ${submission.outcome.error}`);
  }
  return submission.outcome.kind === "synced" ? "synced" : "failed";
}

async function dispatch(options: Parameters<typeof claimDueFiscalInvoices>[0], timeoutMs: number): Promise<FiscalDispatchSummary> {
  const summary: FiscalDispatchSummary = { claimed: 0, synced: 0, failed: 0 };
  try {
    const due = await claimDueFiscalInvoices(options);
    summary.claimed = due.length;
    for (const invoice of due) {
      if ((await submitOne(invoice, timeoutMs)) === "synced") summary.synced += 1;
      else summary.failed += 1;
    }
  } catch (error) {
    logger.error("fiscal", "dispatch failed", error);
  }
  return summary;
}

/** Right after a sale/refund: send this order's due invoices now (the till waits at most FISCAL_SUBMIT_TIMEOUT_MS). */
export function submitFiscalNow(restaurantId: string, orderIds: string[]): Promise<FiscalDispatchSummary> {
  if (orderIds.length === 0) return Promise.resolve({ claimed: 0, synced: 0, failed: 0 });
  return dispatch({ restaurantId, orderIds, limit: orderIds.length * 2 }, config.fiscal.submitTimeoutMs);
}

/** Before a day close: one more try for everything this restaurant still has due (a short backlog clears itself). */
export function retryRestaurantFiscal(restaurantId: string): Promise<FiscalDispatchSummary> {
  return dispatch({ restaurantId, limit: 50, includeFailed: true }, config.fiscal.submitTimeoutMs);
}

/** The scheduled job: batches of 20 until nothing is due or `budgetMs` is spent (a failed send is not due again until its retry time). */
export async function drainFiscalQueue(budgetMs = 30_000): Promise<FiscalDispatchSummary> {
  const total: FiscalDispatchSummary = { claimed: 0, synced: 0, failed: 0 };
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    const batch = await dispatch({ limit: 20 }, Math.min(15_000, Math.max(1_000, deadline - Date.now())));
    total.claimed += batch.claimed;
    total.synced += batch.synced;
    total.failed += batch.failed;
    // until a batch finds nothing: a credit note only becomes due once its sale (maybe in this batch) is accepted
    if (batch.claimed === 0) break;
  }
  return total;
}
