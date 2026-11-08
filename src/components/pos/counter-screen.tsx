"use client";

import { useMemo, useState } from "react";
import { ChevronUp, Minus, Plus, Search, Send, X } from "lucide-react";
import type { MenuItem } from "@/shared/contract/models";
import type { OrderType } from "@/shared/contract/enums";
import { POS_ORDER_TYPE_LABELS, POS_ORDER_TYPES, type PosBootstrap } from "@/shared/pos";
import { receiptRate } from "@/shared/pos-receipt";
import { dec } from "@/shared/money";
import { rs } from "./format";
import { ItemOptionsDialog } from "./item-options-dialog";
import { addLine, buildLine, changeQuantity, itemCount, needsOptions, ticketPricing, ticketQuantity, type Ticket, type TicketLine } from "./ticket";

/** Screen 1 — the counter: order type, menu grid (tap to add), and the ticket with its totals. */
export function CounterScreen({
  boot,
  locationId,
  ticket,
  onTicket,
  onSendToKitchen,
  onCharge,
  openTickets,
  onOpenTicket,
  onNewOrder,
}: {
  boot: PosBootstrap;
  locationId: string;
  ticket: Ticket;
  onTicket: (ticket: Ticket) => void;
  onSendToKitchen: () => void;
  onCharge: () => void;
  /** every unpaid ticket on this till (sent to the kitchen, or a draft), the current one included */
  openTickets: Ticket[];
  onOpenTicket: (ticket: Ticket) => void;
  onNewOrder: () => void;
}) {
  const [category, setCategory] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [optionsFor, setOptionsFor] = useState<MenuItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const offHere = useMemo(() => new Set(boot.branchUnavailable[locationId] ?? []), [boot.branchUnavailable, locationId]);
  const items = useMemo(() => {
    const words = query.trim().toLowerCase();
    return boot.menu.filter(
      (item) => (category === "all" || item.categoryId === category) && (!words || item.name.toLowerCase().includes(words) || item.sku?.toLowerCase() === words),
    );
  }, [boot.menu, category, query]);

  function add(item: MenuItem) {
    setNotice(null);
    if (needsOptions(item)) return setOptionsFor(item);
    try {
      onTicket(addLine(ticket, buildLine(item, { variantId: null, addons: [], quantity: 1 }, boot.restaurant.timezone)));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "That item cannot be added.");
    }
  }

  const count = itemCount(ticket);
  const pricing = ticketPricing(ticket, boot.settings);

  const panel = (
    <TicketPanel
      boot={boot}
      ticket={ticket}
      onTicket={onTicket}
      onSendToKitchen={() => {
        setSheetOpen(false);
        onSendToKitchen();
      }}
      onCharge={() => {
        setSheetOpen(false);
        onCharge();
      }}
      onNewOrder={() => {
        setSheetOpen(false);
        onNewOrder();
      }}
    />
  );

  // unpaid tickets: always visible above the menu (phones too), so a table sent to the kitchen is one tap from Charge
  const unpaid = openTickets.filter((open) => open.lines.length > 0);

  return (
    <div className="mx-auto grid w-full max-w-[1600px] gap-4 px-3 pb-28 pt-3 sm:px-4 md:grid-cols-[minmax(0,1fr)_minmax(19rem,22rem)] md:pb-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-5 lg:px-6">
      <section aria-label="Menu" className="min-w-0">
        {unpaid.length > 0 ? (
          <div className="mb-3 rounded-[12px] border border-[var(--pos-line)] bg-white px-3 py-2.5">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--pos-muted)]">
              Open tickets · tap one to add items or charge
            </p>
            <div className="-mx-3 overflow-x-auto px-3 [scrollbar-width:none]">
              <ul className="flex w-max gap-2 pb-0.5">
                {unpaid.map((open) => {
                  const current = open.clientOrderId === ticket.clientOrderId;
                  const total = ticketPricing(open, boot.settings)?.total ?? "0";
                  return (
                    <li key={open.clientOrderId}>
                      <button
                        type="button"
                        aria-current={current ? "true" : undefined}
                        onClick={() => {
                          onOpenTicket(open);
                          if (window.matchMedia("(max-width: 767px)").matches) setSheetOpen(true);
                        }}
                        className={`flex min-h-12 flex-col items-start justify-center rounded-[var(--pos-radius)] border px-3 py-1.5 text-left transition-colors ${
                          current ? "border-[var(--pos-green)] bg-[var(--pos-green-tint)]" : "border-[var(--pos-line-strong)] hover:border-[var(--pos-green)]"
                        }`}
                      >
                        <span className="whitespace-nowrap text-[13px] font-semibold">{ticketLabel(open)}</span>
                        <span className="whitespace-nowrap text-[11px] text-[var(--pos-muted)]">
                          {open.sentAt ? "In kitchen" : "Draft"} · {rs(total)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        ) : null}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div role="radiogroup" aria-label="Order type" className="flex gap-2">
            {POS_ORDER_TYPES.map((type) => (
              <OrderTypeChip key={type} type={type} active={ticket.orderType === type} onSelect={() => onTicket({ ...ticket, orderType: type, updatedAt: new Date().toISOString() })} />
            ))}
          </div>
          <label className="relative block w-full lg:max-w-xs">
            <span className="sr-only">Search menu or scan barcode</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--pos-muted)]" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search menu or scan barcode"
              className="min-h-11 w-full rounded-[var(--pos-radius)] border border-[var(--pos-line)] bg-white pl-9 pr-3 text-[14px] focus:border-[var(--pos-green)] focus:outline-none"
            />
          </label>
        </div>

        <div className="-mx-3 mt-3 overflow-x-auto px-3 [scrollbar-width:none] sm:mx-0 sm:px-0">
          <div role="tablist" aria-label="Categories" className="flex w-max gap-2 pb-1 sm:w-auto sm:flex-wrap">
            {[{ id: "all", name: "All" }, ...boot.categories].map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={category === entry.id}
                onClick={() => setCategory(entry.id)}
                className={`min-h-10 whitespace-nowrap rounded-full border px-4 text-[13px] font-medium transition-colors ${
                  category === entry.id
                    ? "border-[var(--pos-green)] bg-[var(--pos-green)] text-white"
                    : "border-[var(--pos-line)] bg-white text-[var(--pos-ink)] hover:border-[var(--pos-line-strong)]"
                }`}
              >
                {entry.name}
              </button>
            ))}
          </div>
        </div>

        {notice ? (
          <p role="alert" className="mt-3 rounded-[var(--pos-radius)] bg-[var(--pos-amber-tint)] px-3 py-2 text-[13px] text-[var(--pos-amber)]">
            {notice}
          </p>
        ) : null}

        <ul className="mt-3 grid grid-cols-2 gap-2.5 min-[520px]:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {items.map((item) => {
            const available = item.isAvailable && !offHere.has(item.id);
            const inTicket = ticketQuantity(ticket, item.id);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={!available}
                  onClick={() => add(item)}
                  className={`flex h-full min-h-[5.5rem] w-full flex-col justify-between gap-3 rounded-[var(--pos-radius)] border bg-white p-3 text-left shadow-[var(--pos-shadow)] transition-[border-color,transform] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${
                    inTicket ? "border-[var(--pos-green)]" : "border-[var(--pos-line)] hover:border-[var(--pos-line-strong)]"
                  }`}
                >
                  <span className="line-clamp-2 text-[14px] font-medium leading-snug">{item.name}</span>
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold tabular-nums text-[var(--pos-green)]">
                      {available ? `${item.variants.some((variant) => variant.isAvailable) ? "from " : ""}${rs(item.basePrice)}` : "Unavailable"}
                    </span>
                    {inTicket ? (
                      <span className="grid size-6 place-items-center rounded-full bg-[var(--pos-green)] text-[12px] font-semibold text-white" aria-label={`${inTicket} on the ticket`}>
                        {inTicket}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {items.length === 0 ? <p className="mt-10 text-center text-[14px] text-[var(--pos-muted)]">Nothing matches “{query}”.</p> : null}
      </section>

      <aside aria-label="Ticket" className="hidden md:block">
        <div className="sticky top-[4.5rem]">{panel}</div>
      </aside>

      {/* phones: the ticket is a bottom bar that opens as a sheet */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--pos-line)] bg-white px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 md:hidden">
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="flex min-h-12 w-full items-center justify-between gap-3 rounded-[var(--pos-radius)] bg-[var(--pos-green)] px-4 text-white"
        >
          <span className="flex items-center gap-2 text-[14px] font-semibold">
            <ChevronUp className="size-4" aria-hidden />
            {ticket.sentAt ? `${ticketLabel(ticket)} · Charge` : `Ticket · ${count} item${count === 1 ? "" : "s"}`}
          </span>
          <span className="text-[15px] font-semibold tabular-nums">{pricing ? rs(pricing.total) : rs("0")}</span>
        </button>
      </div>
      {sheetOpen ? (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Ticket">
          <button type="button" aria-label="Close ticket" className="absolute inset-0 bg-black/40" onClick={() => setSheetOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-[16px] bg-[var(--pos-canvas)] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div className="mb-2 flex justify-end">
              <button type="button" onClick={() => setSheetOpen(false)} className="grid size-10 place-items-center rounded-full bg-white" aria-label="Close ticket">
                <X className="size-5" aria-hidden />
              </button>
            </div>
            {panel}
          </div>
        </div>
      ) : null}

      {optionsFor ? (
        <ItemOptionsDialog
          item={optionsFor}
          timezone={boot.restaurant.timezone}
          onClose={() => setOptionsFor(null)}
          onAdd={(line) => {
            onTicket(addLine(ticket, line));
            setOptionsFor(null);
          }}
        />
      ) : null}
    </div>
  );
}

/** "Table 4", the customer's name, or "Walk-in" — how a ticket is named on the till. */
function ticketLabel(ticket: Ticket): string {
  if (ticket.orderType === "dine_in") return ticket.tableNumber ? `Table ${ticket.tableNumber}` : "No table";
  return ticket.customerName || "Walk-in";
}

function OrderTypeChip({ type, active, onSelect }: { type: OrderType; active: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onSelect}
      className={`min-h-10 flex-1 rounded-[8px] px-4 text-[13px] font-semibold transition-colors sm:flex-none ${
        active ? "bg-[var(--pos-dark)] text-white" : "bg-[var(--pos-chip)] text-white hover:bg-[#7a7974]"
      }`}
    >
      {POS_ORDER_TYPE_LABELS[type]}
    </button>
  );
}

const input =
  "min-h-10 w-full rounded-[8px] border border-[var(--pos-line)] bg-white px-2.5 text-[14px] focus:border-[var(--pos-green)] focus:outline-none";

export function TicketPanel({
  boot,
  ticket,
  onTicket,
  onSendToKitchen,
  onCharge,
  onNewOrder,
}: {
  boot: PosBootstrap;
  ticket: Ticket;
  onTicket: (ticket: Ticket) => void;
  onSendToKitchen: () => void;
  onCharge: () => void;
  onNewOrder: () => void;
}) {
  const pricing = ticketPricing(ticket, boot.settings);
  const set = (patch: Partial<Ticket>) => onTicket({ ...ticket, ...patch, updatedAt: new Date().toISOString() });
  const unsent = ticket.lines.some((line) => !line.sent);
  const title = `${ticketLabel(ticket)} · ${POS_ORDER_TYPE_LABELS[ticket.orderType]}`;

  return (
    <div className="flex flex-col rounded-[12px] border border-[var(--pos-line)] bg-white shadow-[var(--pos-shadow)]">
      <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-4">
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold">{title}</h2>
          <p className="text-[12px] text-[var(--pos-muted)]">
            {ticket.orderNumber ? `Order #${ticket.orderNumber}` : ticket.sentAt ? "Order sent" : "New order"}
            {ticket.orderType === "dine_in" && ticket.guests ? ` · ${ticket.guests} guest${ticket.guests === 1 ? "" : "s"}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          {unsent ? (
            <button
              type="button"
              onClick={() => set({ lines: ticket.lines.filter((line) => line.sent) })}
              className="min-h-9 rounded-[8px] border border-[var(--pos-line)] px-3 text-[12px] font-medium"
            >
              Clear
            </button>
          ) : null}
          {ticket.lines.length > 0 ? (
            <button
              type="button"
              onClick={onNewOrder}
              className="inline-flex min-h-9 items-center gap-1 rounded-[8px] border border-[var(--pos-line-strong)] px-3 text-[12px] font-semibold"
            >
              <Plus className="size-3.5" aria-hidden />
              New order
            </button>
          ) : null}
        </div>
      </div>
      {ticket.sentAt ? (
        <p className="mx-4 mb-3 rounded-[8px] bg-[var(--pos-green-tint)] px-3 py-2 text-[12px] text-[var(--pos-green)]">
          {unsent
            ? "New items are not in the kitchen yet: press Send to kitchen, or Charge when the guest is ready to pay."
            : "In the kitchen. Charge when the guest asks for the bill, or start a New order — this ticket stays under Open tickets."}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2 px-4 pb-3">
        {ticket.orderType === "dine_in" ? (
          <>
            <label className="text-[12px] text-[var(--pos-muted)]">
              Table
              <input className={input} inputMode="numeric" value={ticket.tableNumber ?? ""} maxLength={20} onChange={(event) => set({ tableNumber: event.target.value.trim() || null })} />
            </label>
            <label className="text-[12px] text-[var(--pos-muted)]">
              Guests
              <input className={input} inputMode="numeric" value={ticket.guests ?? ""} onChange={(event) => set({ guests: Number.parseInt(event.target.value, 10) || null })} />
            </label>
          </>
        ) : (
          <>
            <label className="text-[12px] text-[var(--pos-muted)]">
              Name
              <input className={input} value={ticket.customerName ?? ""} maxLength={120} onChange={(event) => set({ customerName: event.target.value || null })} />
            </label>
            <label className="text-[12px] text-[var(--pos-muted)]">
              Phone{ticket.orderType === "delivery" ? " *" : ""}
              <input className={input} inputMode="tel" value={ticket.customerPhone ?? ""} maxLength={30} onChange={(event) => set({ customerPhone: event.target.value || null })} />
            </label>
            {ticket.orderType === "delivery" ? (
              <label className="col-span-2 text-[12px] text-[var(--pos-muted)]">
                Delivery address *
                <input className={input} value={ticket.address ?? ""} maxLength={300} onChange={(event) => set({ address: event.target.value || null })} />
              </label>
            ) : null}
          </>
        )}
      </div>

      <ul className="max-h-[42dvh] overflow-y-auto border-t border-[var(--pos-line)] md:max-h-[calc(100dvh-31rem)] md:min-h-[6rem]">
        {ticket.lines.length === 0 ? <li className="px-4 py-8 text-center text-[13px] text-[var(--pos-muted)]">Tap an item to add it.</li> : null}
        {ticket.lines.map((line) => (
          <TicketRow key={line.clientLineId} line={line} onChange={(delta) => onTicket(changeQuantity(ticket, line.clientLineId, delta))} />
        ))}
      </ul>

      <div className="rounded-b-[12px] border-t border-[var(--pos-line)] bg-[#faf9f6] px-4 pb-4 pt-3">
        <dl className="flex flex-col gap-1 text-[13px]">
          <div className="flex justify-between text-[var(--pos-muted)]">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{rs(pricing?.subtotal)}</dd>
          </div>
          {pricing && dec(pricing.serviceFee).greaterThan(0) ? (
            <div className="flex justify-between text-[var(--pos-muted)]">
              <dt>Service charge</dt>
              <dd className="tabular-nums">{rs(pricing.serviceFee)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between text-[var(--pos-muted)]">
            <dt>
              {boot.receipt.taxLabel} (PRA) {pricing ? `${receiptRate(pricing.taxRate)}%` : ""}
            </dt>
            <dd className="tabular-nums">{rs(pricing?.tax)}</dd>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <dt className="text-[17px] font-semibold">Total</dt>
            <dd className="text-[19px] font-bold tabular-nums">{rs(pricing?.total)}</dd>
          </div>
        </dl>
        <p className="mt-1.5 text-[11px] leading-snug text-[var(--pos-amber)]">Card or digital payment is taxed at a lower rate; the total updates at payment.</p>
        <div className="mt-3 grid grid-cols-[auto_1fr] gap-2">
          <button
            type="button"
            disabled={!unsent}
            onClick={onSendToKitchen}
            className="inline-flex min-h-12 items-center justify-center gap-1.5 rounded-[var(--pos-radius)] border border-[var(--pos-line-strong)] bg-white px-3 text-[13px] font-semibold disabled:opacity-40"
          >
            <Send className="size-4" aria-hidden />
            Send to kitchen
          </button>
          <button
            type="button"
            disabled={ticket.lines.length === 0}
            onClick={onCharge}
            className="min-h-12 rounded-[var(--pos-radius)] bg-[var(--pos-green)] px-3 text-[14px] font-semibold text-white transition-colors hover:bg-[var(--pos-green-strong)] disabled:opacity-40"
          >
            Charge {pricing ? rs(pricing.total) : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

function TicketRow({ line, onChange }: { line: TicketLine; onChange: (delta: number) => void }) {
  const each = dec(line.unitPrice).plus(dec(line.addonsTotal));
  return (
    <li className="flex items-center gap-2 border-b border-[var(--pos-line)] px-4 py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">
          {line.name}
          {line.variantName ? <span className="text-[var(--pos-muted)]"> · {line.variantName}</span> : null}
        </p>
        <p className="truncate text-[11px] text-[var(--pos-muted)]">
          {rs(each.toFixed(2))} each
          {line.addonNames.length ? ` · ${line.addonNames.join(", ")}` : ""}
          {line.sent ? " · sent" : ""}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" aria-label={`One less ${line.name}`} disabled={line.sent} onClick={() => onChange(-1)} className="grid size-9 place-items-center rounded-[8px] border border-[var(--pos-line-strong)] disabled:opacity-30">
          <Minus className="size-3.5" aria-hidden />
        </button>
        <span className="w-6 text-center text-[13px] font-semibold tabular-nums">{line.quantity}</span>
        <button type="button" aria-label={`One more ${line.name}`} disabled={line.sent} onClick={() => onChange(1)} className="grid size-9 place-items-center rounded-[8px] border border-[var(--pos-line-strong)] disabled:opacity-30">
          <Plus className="size-3.5" aria-hidden />
        </button>
      </div>
      <span className="w-[4.75rem] shrink-0 text-right text-[13px] font-semibold tabular-nums">{rs(each.times(line.quantity).toFixed(2))}</span>
    </li>
  );
}
