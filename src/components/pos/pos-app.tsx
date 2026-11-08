"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CloudOff, LogOut, Menu, Monitor, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { POS_TENDER_METHOD, changeDue, formatInvoiceNumber, type PosBootstrap, type PosDevice, type PosShift, type PosTender, type ZReport, type FiscalInvoiceView } from "@/shared/pos";
import type { ReceiptDocument } from "@/shared/pos-receipt";
import { posApi } from "./api";
import { BrowserPrinterProvider, usePrinter } from "./printing";
import { bumpInvoiceSeq, nextInvoiceSeq, posDb, store, type SavedReceipt } from "./offline-store";
import { usePosSync, type OpOutcome, type SyncState } from "./sync";
import { rs } from "./format";
import { newTicket, ticketInput, ticketPricing, ticketProblem, type Ticket } from "./ticket";
import { creditNoteReceipt, saleReceipt } from "./receipt-doc";
import { CounterScreen } from "./counter-screen";
import { PaymentScreen } from "./payment-screen";
import { ReceiptScreen } from "./receipt-screen";
import { DayCloseScreen } from "./day-close-screen";
import { OpenShift, TillSetup } from "./setup-screens";

/**
 * The till (SKILL.md §43). One client app with four screens — counter, payment, receipt, day close — working from
 * IndexedDB, so a lost connection never stops a sale: orders and payments are queued (sync.ts) and invoice numbers
 * are assigned on the till. Online-only: registering a till, opening/closing a shift, refunds.
 */
export function PosApp({ initialBootstrap }: { initialBootstrap: PosBootstrap }) {
  return (
    <BrowserPrinterProvider>
      <Till initialBootstrap={initialBootstrap} />
    </BrowserPrinterProvider>
  );
}

type Screen = "counter" | "payment" | "receipt" | "close";
type ShiftInvoice = FiscalInvoiceView & { orderNumber: string; tableNumber: string | null; refunded: boolean };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function Till({ initialBootstrap }: { initialBootstrap: PosBootstrap }) {
  const printer = usePrinter();
  const [boot, setBoot] = useState(initialBootstrap);
  const [deviceId, setDeviceId] = useState<string | null | undefined>(undefined);
  const [shift, setShift] = useState<PosShift | null | undefined>(undefined);
  const [ticket, setTicketState] = useState<Ticket>(() => newTicket());
  const [openTickets, setOpenTickets] = useState<Ticket[]>([]);
  const [screen, setScreen] = useState<Screen>("counter");
  const [receipt, setReceipt] = useState<SavedReceipt | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const receiptId = useRef<string | null>(null);
  const ticketRef = useRef(ticket);
  ticketRef.current = ticket;

  const device: PosDevice | null = useMemo(() => boot.devices.find((candidate) => candidate.id === deviceId) ?? null, [boot.devices, deviceId]);

  // ---- server answers to queued ops ---------------------------------------------------------------------------
  const refreshTickets = useCallback(async () => {
    setOpenTickets(await posDb().tickets.orderBy("updatedAt").toArray());
  }, []);

  const refreshBootstrap = useCallback(async () => {
    const result = await posApi<PosBootstrap>("bootstrap");
    if (result.ok) {
      setBoot(result.data);
      await store.saveBootstrap(result.data);
    }
    return result.ok;
  }, []);

  const onResults = useCallback(
    async (outcomes: OpOutcome[]) => {
      const db = posDb();
      for (const { op, result } of outcomes) {
        if (!result.ok && result.error) {
          toast.error(`Not recorded: ${result.error.message}`, { duration: 10_000 });
          if (result.error.code === "INVOICE_SEQ_TAKEN" && op.kind === "sale" && deviceId) {
            // this till's counter fell behind the server (reinstalled browser): skip past every number already used
            await bumpInvoiceSeq(deviceId, op.sale.invoiceSeq);
            void refreshBootstrap();
          }
          continue;
        }
        const clientOrderId = op.ticket.clientOrderId;
        if (op.kind === "ticket" && result.orderNumber) {
          await db.tickets.update(clientOrderId, { orderNumber: result.orderNumber });
          if (ticketRef.current.clientOrderId === clientOrderId) setTicketState((current) => ({ ...current, orderNumber: result.orderNumber! }));
        }
        if (op.kind === "sale") {
          // the receipt learns its order and, once PRA answered, the authority number and QR (for reprints)
          const saved = await db.receipts.get(clientOrderId);
          if (saved) {
            const doc: ReceiptDocument = {
              ...saved.doc,
              orderNumber: result.orderNumber ?? saved.doc.orderNumber,
              authorityInvoiceNumber: result.fiscal?.authorityInvoiceNumber ?? saved.doc.authorityInvoiceNumber,
              qrPayload: result.fiscal?.qrPayload ?? saved.doc.qrPayload,
            };
            const next = { ...saved, orderId: result.orderId ?? saved.orderId, doc };
            await db.receipts.put(next);
            if (receiptId.current === saved.id) setReceipt(next);
          }
          if (result.totalMismatch) {
            toast.warning(
              `Invoice ${result.invoiceNumber}: a price changed while offline — recorded as ${rs(result.totalMismatch.actual)} (printed ${rs(result.totalMismatch.expected)}).`,
              { duration: 15_000 },
            );
          }
        }
      }
      await refreshTickets();
    },
    [deviceId, refreshBootstrap, refreshTickets],
  );
  const sync = usePosSync(onResults);

  // ---- startup: cache the bootstrap, register the service worker, restore this till's state ---------------------
  useEffect(() => {
    void store.saveBootstrap(initialBootstrap);
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/pos/sw.js", { scope: "/pos" }).catch(() => undefined);
    void store.deviceId().then((id) => setDeviceId(id && initialBootstrap.devices.some((candidate) => candidate.id === id) ? id : null));
  }, [initialBootstrap]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (navigator.onLine) void refreshBootstrap();
    }, 5 * 60_000);
    return () => window.clearInterval(timer);
  }, [refreshBootstrap]);

  useEffect(() => {
    if (!deviceId) return;
    let cancelled = false;
    (async () => {
      const cached = await store.shift(deviceId);
      if (!cancelled) setShift(cached);
      const state = await posApi<{ device: PosDevice; shift: PosShift | null }>(`tills/${deviceId}`);
      if (cancelled) return;
      if (state.ok) {
        setShift(state.data.shift);
        await store.saveShift(deviceId, state.data.shift);
      } else if (state.status === 404) {
        await store.saveDeviceId(null);
        setDeviceId(null);
      } else if (cached === null) {
        setShift(null);
      }
      const currentId = await store.currentTicketId(deviceId);
      const current = currentId ? await posDb().tickets.get(currentId) : undefined;
      if (current && !cancelled) setTicketState(current);
      await refreshTickets();
    })();
    return () => {
      cancelled = true;
    };
  }, [deviceId, refreshTickets]);

  // ---- the ticket (persisted on every change, so nothing is lost on reload) -------------------------------------
  const setTicket = useCallback(
    (next: Ticket) => {
      setTicketState(next);
      if (!deviceId) return;
      void (async () => {
        if (next.lines.length > 0 || next.sentAt) await posDb().tickets.put(next);
        else await posDb().tickets.delete(next.clientOrderId);
        await store.saveCurrentTicketId(deviceId, next.clientOrderId);
        await refreshTickets();
      })();
    },
    [deviceId, refreshTickets],
  );

  async function sendToKitchen() {
    if (!shift) return;
    const problem = ticketProblem(ticket);
    if (problem) return void toast.error(problem);
    const sent: Ticket = { ...ticket, lines: ticket.lines.map((line) => ({ ...line, sent: true })), sentAt: ticket.sentAt ?? new Date().toISOString(), updatedAt: new Date().toISOString() };
    await posDb().tickets.put(sent);
    await sync.enqueue({ id: crypto.randomUUID(), kind: "ticket", shiftId: shift.id, ticket: ticketInput(sent) });
    toast.success(`Sent to the kitchen${sent.tableNumber ? ` · Table ${sent.tableNumber}` : ""}`);
    // the ticket stays on screen, ready to Charge; "New order" starts the next one (this one stays under Open tickets)
    setTicket(sent);
  }

  function charge() {
    const problem = ticketProblem(ticket);
    if (problem) return void toast.error(problem);
    setScreen("payment");
  }

  async function completeSale({ tender, tendered }: { tender: PosTender; tendered: string | null }) {
    if (!shift || !device) return;
    const method = POS_TENDER_METHOD[tender].method;
    const pricing = ticketPricing(ticket, boot.settings, method)!;
    const seq = await nextInvoiceSeq(device.id, device.lastInvoiceSeq);
    const issuedAt = new Date().toISOString();
    const invoiceNumber = formatInvoiceNumber(device.code, seq);
    const change = tendered ? changeDue(pricing.total, tendered) : null;
    const doc = saleReceipt({ boot, device, ticket, pricing, invoiceNumber, issuedAt, tender, tendered, change });
    const saved: SavedReceipt = { id: ticket.clientOrderId, doc, orderId: null, createdAt: issuedAt };
    const db = posDb();
    // the receipt, the queued sale and the ticket's removal land together: a crash leaves either all or none
    await db.transaction("rw", db.receipts, db.tickets, db.queue, async () => {
      await db.receipts.put(saved);
      await db.tickets.delete(ticket.clientOrderId);
      await db.queue.add({
        id: crypto.randomUUID(),
        op: {
          id: crypto.randomUUID(),
          kind: "sale",
          shiftId: shift.id,
          ticket: ticketInput(ticket),
          sale: {
            clientOrderId: ticket.clientOrderId,
            invoiceSeq: seq,
            issuedAt,
            expectedTotal: pricing.total,
            tenders: [{ clientPaymentId: crypto.randomUUID(), tender, amount: pricing.total, tendered }],
          },
        },
        createdAt: issuedAt,
        attempts: 0,
        lastError: null,
      });
    });
    receiptId.current = saved.id;
    setReceipt(saved);
    await sync.refresh();
    // online: give PRA a moment so the number is on the printed receipt; offline: print at once with "pending"
    if (navigator.onLine) await Promise.race([sync.flush(), sleep(6_000)]);
    else void sync.flush();
    const latest = (await db.receipts.get(saved.id)) ?? saved;
    setReceipt(latest);
    setTicket(newTicket(ticket.orderType));
    setScreen("receipt");
    await printer.print({ kind: "receipt", doc: latest.doc });
  }

  async function refund(invoice: ShiftInvoice, reason: string): Promise<boolean> {
    if (!shift || !device) return false;
    if (sync.state.pending > 0) {
      toast.error("Wait until every sale on this till is sent, then refund.");
      return false;
    }
    const seq = await nextInvoiceSeq(device.id, device.lastInvoiceSeq);
    const issuedAt = new Date().toISOString();
    const result = await posApi<FiscalInvoiceView>("refund", { invoiceId: invoice.id, shiftId: shift.id, invoiceSeq: seq, issuedAt, reason });
    if (!result.ok) {
      toast.error(result.message);
      return false;
    }
    const sale = await posDb().receipts.where("orderId").equals(invoice.orderId).first();
    if (sale) {
      const doc = creditNoteReceipt(sale.doc, {
        invoiceNumber: result.data.invoiceNumber,
        issuedAt,
        timezone: boot.restaurant.timezone,
        cashier: boot.cashier.name,
        authorityInvoiceNumber: result.data.authorityInvoiceNumber,
        qrPayload: result.data.qrPayload,
      });
      await posDb().receipts.put({ id: result.data.id, doc, orderId: invoice.orderId, createdAt: issuedAt });
      await printer.print({ kind: "receipt", doc });
    }
    toast.success(`Credit note ${result.data.invoiceNumber} issued.`);
    return true;
  }

  async function reprint(invoice: ShiftInvoice) {
    const saved = await posDb().receipts.where("orderId").equals(invoice.orderId).filter((entry) => entry.doc.invoiceNumber === invoice.invoiceNumber).first();
    if (!saved) return void toast.error("That receipt was printed on another till; reprint it there.");
    const doc = { ...saved.doc, authorityInvoiceNumber: invoice.authorityInvoiceNumber ?? saved.doc.authorityInvoiceNumber, qrPayload: invoice.qrPayload ?? saved.doc.qrPayload };
    await printer.print({ kind: "receipt", doc });
  }

  async function chooseDevice(chosen: PosDevice) {
    if (!boot.devices.some((candidate) => candidate.id === chosen.id)) setBoot({ ...boot, devices: [...boot.devices, chosen] });
    await store.saveDeviceId(chosen.id);
    setShift(undefined);
    setDeviceId(chosen.id);
  }

  async function signOut() {
    if (sync.state.pending > 0 && !window.confirm(`${sync.state.pending} sale(s) are not sent yet. They stay on this till and are sent after the next sign-in. Sign out?`)) return;
    await posApi("logout", {});
    window.location.assign("/pos/login");
  }

  const branch = device ? boot.branches.find((candidate) => candidate.id === device.locationId) : null;
  const title = [branch?.name ?? device?.locationName, shift ? `Shift ${shift.shiftNumber}` : null, `Cashier: ${boot.cashier.name}`].filter(Boolean).join(" · ");

  let body: React.ReactNode;
  if (deviceId === undefined || (deviceId && shift === undefined)) {
    body = <div className="grid min-h-[60dvh] place-items-center text-[14px] text-[var(--pos-muted)]">Opening the till…</div>;
  } else if (!device) {
    body = <TillSetup boot={boot} online={sync.state.online} onChosen={chooseDevice} />;
  } else if (!shift) {
    body = (
      <OpenShift
        device={device}
        online={sync.state.online}
        onOpened={async (opened) => {
          await store.saveShift(device.id, opened);
          setShift(opened);
          setScreen("counter");
        }}
        onChangeTill={async () => {
          await store.saveDeviceId(null);
          setDeviceId(null);
        }}
      />
    );
  } else if (screen === "payment") {
    body = <PaymentScreen boot={boot} ticket={ticket} online={sync.state.online} onBack={() => setScreen("counter")} onComplete={completeSale} />;
  } else if (screen === "receipt" && receipt) {
    body = (
      <ReceiptScreen
        doc={receipt.doc}
        onReprint={() => void printer.print({ kind: "receipt", doc: receipt.doc })}
        onNewOrder={() => {
          receiptId.current = null;
          setScreen("counter");
        }}
      />
    );
  } else if (screen === "close") {
    body = (
      <DayCloseScreen
        shift={shift}
        title={`${branch?.name ?? device.locationName} · ${device.name} · Shift ${shift.shiftNumber}`}
        canManage={boot.cashier.canManage}
        online={sync.state.online}
        queued={sync.state.pending}
        onBack={() => setScreen("counter")}
        onReprint={reprint}
        onRefund={refund}
        onPrintReport={(report: ZReport) =>
          void printer.print({
            kind: "z-report",
            report,
            header: { businessName: boot.receipt.businessName, branchName: branch?.name ?? device.locationName, tillName: device.name, shiftLabel: `Shift ${shift.shiftNumber}`, timezone: boot.restaurant.timezone },
          })
        }
        onClosed={async ({ report }) => {
          await printer.print({
            kind: "z-report",
            report,
            header: { businessName: boot.receipt.businessName, branchName: branch?.name ?? device.locationName, tillName: device.name, shiftLabel: `Shift ${shift.shiftNumber}`, timezone: boot.restaurant.timezone },
          });
          await store.saveShift(device.id, null);
          setShift(null);
          setScreen("counter");
          toast.success("Day closed. The Z-report was sent to the printer.");
        }}
      />
    );
  } else {
    body = (
      <CounterScreen
        boot={boot}
        locationId={device.locationId}
        ticket={ticket}
        onTicket={setTicket}
        onSendToKitchen={() => void sendToKitchen()}
        onCharge={charge}
        openTickets={openTickets}
        onOpenTicket={(open) => setTicket(open)}
        onNewOrder={() => setTicket(newTicket(ticket.orderType))}
      />
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar
        name={boot.restaurant.name}
        title={device ? title : `Cashier: ${boot.cashier.name}`}
        sync={sync.state}
        showClose={Boolean(shift) && screen !== "close"}
        onCloseDay={() => setScreen("close")}
        menuOpen={menuOpen}
        onMenu={setMenuOpen}
        onRefresh={async () => {
          setMenuOpen(false);
          if (await refreshBootstrap()) toast.success("Menu and prices refreshed.");
          else toast.error("Could not reach the server: using the saved menu.");
          void sync.flush();
        }}
        onSwitchTill={
          device && !shift
            ? async () => {
                setMenuOpen(false);
                await store.saveDeviceId(null);
                setDeviceId(null);
              }
            : null
        }
        onSignOut={signOut}
      />
      {sync.state.failed.length > 0 ? (
        <div role="alert" className="mx-3 mt-3 flex flex-col gap-2 rounded-[var(--pos-radius)] border border-[#f3c7c1] bg-[var(--pos-red-tint)] px-4 py-3 text-[13px] text-[var(--pos-red)] sm:mx-4 lg:mx-6">
          {sync.state.failed.map((failed) => (
            <div key={failed.id} className="flex items-start justify-between gap-3">
              <span className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  {failed.op.kind === "sale" ? `Sale ${failed.op.sale.invoiceSeq}` : "Kitchen ticket"} was not recorded: {failed.error.message} Tell a manager.
                </span>
              </span>
              <button type="button" onClick={() => void sync.dismissFailed(failed.id)} className="grid size-8 shrink-0 place-items-center rounded-full hover:bg-white/60" aria-label="Dismiss">
                <X className="size-4" aria-hidden />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {sync.state.signedOut ? (
        <p role="alert" className="mx-3 mt-3 rounded-[var(--pos-radius)] bg-[var(--pos-amber-tint)] px-4 py-3 text-[13px] text-[var(--pos-amber)] sm:mx-4 lg:mx-6">
          Your session ended. {sync.state.pending} sale(s) are saved on this till.{" "}
          <a href="/pos/login" className="font-semibold underline">
            Sign in again
          </a>{" "}
          to send them.
        </p>
      ) : null}
      <main className="flex-1">{body}</main>
    </div>
  );
}

function TopBar({
  name,
  title,
  sync,
  showClose,
  onCloseDay,
  menuOpen,
  onMenu,
  onRefresh,
  onSwitchTill,
  onSignOut,
}: {
  name: string;
  title: string;
  sync: SyncState;
  showClose: boolean;
  onCloseDay: () => void;
  menuOpen: boolean;
  onMenu: (open: boolean) => void;
  onRefresh: () => void;
  onSwitchTill: (() => void) | null;
  onSignOut: () => void;
}) {
  const status = !sync.online
    ? { label: `Offline · ${sync.pending} queued`, tone: "bg-[var(--pos-amber-tint)] text-[var(--pos-amber)]", dot: "bg-[var(--pos-amber)]" }
    : sync.pending > 0
      ? { label: `Syncing · ${sync.pending} left`, tone: "bg-[var(--pos-amber-tint)] text-[var(--pos-amber)]", dot: "bg-[var(--pos-amber)]" }
      : { label: "Online · synced", tone: "bg-[var(--pos-green-tint)] text-[var(--pos-green)]", dot: "bg-[var(--pos-green)]" };
  return (
    <header className="sticky top-0 z-20 border-b border-[var(--pos-line)] bg-white/95 backdrop-blur">
      <div className="mx-auto flex min-h-14 w-full max-w-[1600px] items-center gap-3 px-3 sm:px-4 lg:px-6">
        <span className="grid size-8 shrink-0 place-items-center rounded-[8px] bg-[var(--pos-green)] text-[14px] font-bold text-white" aria-hidden>
          {name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-3">
          <p className="truncate text-[14px] font-semibold">{name} POS</p>
          <p className="truncate text-[12px] text-[var(--pos-muted)]">{title}</p>
        </div>
        <span className={`hidden shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium sm:inline-flex ${status.tone}`} role="status">
          {sync.online ? <span className={`size-2 rounded-full ${status.dot}`} aria-hidden /> : <CloudOff className="size-3.5" aria-hidden />}
          {status.label}
        </span>
        <span className={`inline-flex size-3 shrink-0 rounded-full sm:hidden ${status.dot}`} role="status" aria-label={status.label} />
        {showClose ? (
          <button type="button" onClick={onCloseDay} className="hidden min-h-9 shrink-0 rounded-[8px] border border-[var(--pos-line-strong)] px-3 text-[13px] font-medium sm:inline-flex sm:items-center">
            Close day
          </button>
        ) : null}
        <div className="relative">
          <button type="button" onClick={() => onMenu(!menuOpen)} aria-expanded={menuOpen} aria-label="Till menu" className="grid size-10 place-items-center rounded-[8px] hover:bg-[var(--pos-canvas)]">
            <Menu className="size-5" aria-hidden />
          </button>
          {menuOpen ? (
            <div className="absolute right-0 top-12 z-30 w-56 overflow-hidden rounded-[12px] border border-[var(--pos-line)] bg-white py-1 shadow-lg">
              {showClose ? (
                <MenuItem
                  onClick={() => {
                    onMenu(false);
                    onCloseDay();
                  }}
                >
                  Close day (Z-report)
                </MenuItem>
              ) : null}
              <MenuItem onClick={onRefresh}>
                <RefreshCw className="size-4" aria-hidden /> Refresh menu &amp; prices
              </MenuItem>
              {onSwitchTill ? (
                <MenuItem onClick={onSwitchTill}>
                  <Monitor className="size-4" aria-hidden /> Switch till
                </MenuItem>
              ) : null}
              <MenuItem onClick={onSignOut}>
                <LogOut className="size-4" aria-hidden /> Sign out
              </MenuItem>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function MenuItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-11 w-full items-center gap-2 px-4 text-left text-[14px] hover:bg-[var(--pos-canvas)]">
      {children}
    </button>
  );
}
