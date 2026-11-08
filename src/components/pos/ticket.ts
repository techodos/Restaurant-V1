import type { OrderType, PaymentMethod } from "@/shared/contract/enums";
import type { MenuItem, Money } from "@/shared/contract/models";
import type { RestaurantSettings } from "@/shared/contract/settings";
import type { PosTicketInput } from "@/shared/pos";
import { resolveMenuSelection } from "@/server/domain/menu-selection";
import { priceTicket } from "@/server/domain/pos";
import type { PricingResult } from "@/server/domain/pricing";

/**
 * A ticket on the till (the order being taken). Lives in IndexedDB until paid, so a reload or a power cut loses
 * nothing. Priced with the SAME resolver and engine the server uses (resolveMenuSelection, priceTicket); the server
 * re-prices from the database when the op arrives, the till's numbers are only what it shows and prints.
 */

export interface TicketLine {
  clientLineId: string;
  menuItemId: string;
  variantId: string | null;
  addons: { addonId: string; quantity: number }[];
  quantity: number;
  name: string;
  variantName: string | null;
  addonNames: string[];
  unitPrice: Money;
  addonsTotal: Money;
  notes: string | null;
  /** already sent to the kitchen: locked (a void needs a manager, not built yet) */
  sent: boolean;
}

export interface Ticket {
  clientOrderId: string;
  orderType: OrderType;
  tableNumber: string | null;
  guests: number | null;
  customerName: string | null;
  customerPhone: string | null;
  address: string | null;
  notes: string | null;
  lines: TicketLine[];
  /** set once the server answered the first "send to kitchen" */
  orderNumber: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function newTicket(orderType: OrderType = "dine_in"): Ticket {
  const now = new Date().toISOString();
  return {
    clientOrderId: crypto.randomUUID(),
    orderType,
    tableNumber: null,
    guests: null,
    customerName: null,
    customerPhone: null,
    address: null,
    notes: null,
    lines: [],
    orderNumber: null,
    sentAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export interface LineSelection {
  variantId: string | null;
  addons: { addonId: string; quantity: number }[];
  quantity: number;
}

/** True when tapping the item must ask for a variant or add-ons first. */
export function needsOptions(item: MenuItem): boolean {
  return item.variants.some((variant) => variant.isAvailable) || item.addonGroups.some((group) => group.addons.length > 0);
}

/** A line priced from the cached menu (throws the same PricingError the server would for a bad selection). */
export function buildLine(item: MenuItem, selection: LineSelection, timezone: string): TicketLine {
  const resolved = resolveMenuSelection({ item, category: { isActive: true, availability: {} } }, { menuItemId: item.id, ...selection }, timezone);
  return {
    clientLineId: crypto.randomUUID(),
    menuItemId: item.id,
    variantId: resolved.variant?.id ?? null,
    addons: selection.addons,
    quantity: selection.quantity,
    name: item.name,
    variantName: resolved.variant?.name ?? null,
    addonNames: resolved.addons.map((addon) => (addon.quantity > 1 ? `${addon.name} ×${addon.quantity}` : addon.name)),
    unitPrice: resolved.unitPrice,
    addonsTotal: resolved.addonsTotal,
    notes: null,
    sent: false,
  };
}

const sameSelection = (a: TicketLine, b: TicketLine) =>
  a.menuItemId === b.menuItemId &&
  a.variantId === b.variantId &&
  JSON.stringify(a.addons) === JSON.stringify(b.addons) &&
  !a.notes &&
  !b.notes;

/** Adds a line, merging into an unsent identical one (a second tap on Cappuccino = qty 2). */
export function addLine(ticket: Ticket, line: TicketLine): Ticket {
  const match = ticket.lines.find((candidate) => !candidate.sent && sameSelection(candidate, line));
  const lines = match
    ? ticket.lines.map((candidate) => (candidate === match ? { ...candidate, quantity: Math.min(99, candidate.quantity + line.quantity) } : candidate))
    : [...ticket.lines, line];
  return { ...ticket, lines, updatedAt: new Date().toISOString() };
}

/** +/- on an unsent line; 0 removes it. Sent lines do not change. */
export function changeQuantity(ticket: Ticket, clientLineId: string, delta: number): Ticket {
  const lines = ticket.lines.flatMap((line) => {
    if (line.clientLineId !== clientLineId || line.sent) return [line];
    const quantity = line.quantity + delta;
    return quantity <= 0 ? [] : [{ ...line, quantity: Math.min(99, quantity) }];
  });
  return { ...ticket, lines, updatedAt: new Date().toISOString() };
}

export function ticketQuantity(ticket: Ticket, menuItemId: string): number {
  return ticket.lines.filter((line) => line.menuItemId === menuItemId).reduce((sum, line) => sum + line.quantity, 0);
}

export function itemCount(ticket: Ticket): number {
  return ticket.lines.reduce((sum, line) => sum + line.quantity, 0);
}

export function ticketPricing(ticket: Ticket, settings: RestaurantSettings, method: PaymentMethod | null = null): PricingResult | null {
  if (ticket.lines.length === 0) return null;
  return priceTicket(
    ticket.lines.map((line) => ({ unitPrice: line.unitPrice, addonsTotal: line.addonsTotal, quantity: line.quantity })),
    ticket.orderType,
    settings,
    method,
  );
}

/** What the server receives: ids and quantities only. */
export function ticketInput(ticket: Ticket): PosTicketInput {
  return {
    clientOrderId: ticket.clientOrderId,
    orderType: ticket.orderType,
    tableNumber: ticket.tableNumber,
    guests: ticket.guests,
    customerName: ticket.customerName,
    customerPhone: ticket.customerPhone,
    address: ticket.address,
    notes: ticket.notes,
    lines: ticket.lines.map((line) => ({
      clientLineId: line.clientLineId,
      menuItemId: line.menuItemId,
      variantId: line.variantId,
      quantity: line.quantity,
      addons: line.addons,
      notes: line.notes,
    })),
  };
}

/** Why a ticket cannot be sent yet (null = it can). */
export function ticketProblem(ticket: Ticket): string | null {
  if (ticket.lines.length === 0) return "Add an item first.";
  if (ticket.orderType === "dine_in" && !ticket.tableNumber) return "Choose a table for a dine-in order.";
  if (ticket.orderType === "delivery" && (!ticket.customerPhone || !ticket.address)) return "A delivery order needs a phone number and address.";
  return null;
}
