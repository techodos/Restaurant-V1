import type { OpeningHours } from "@/shared/contract/models";
import { acceptsOrdersAt, zonedNow } from "@/shared/hours";

/**
 * Dine-in has two shapes (owner decision 2026-10-27), the way restaurant ordering apps do it:
 *   - ORDER AHEAD from anywhere: the branch, an arrival time and the party size; staff seat the guests when they
 *     arrive, so nobody is asked for a table number;
 *   - SEATED, from the QR code on the table: `/table/<branchId>/<table>` remembers the table (and its branch) for
 *     a few hours, so the table comes from the code, never typed, and no arrival time is needed.
 * Pure and isomorphic: the checkout page builds the arrival choices, `createOrder` re-checks the chosen one.
 */

const TABLE_COOKIE_PREFIX = "rp_table_";
/** a sitting: long enough for a meal and a dessert order, short enough not to follow the guest home */
export const TABLE_COOKIE_MAX_AGE = 4 * 60 * 60;

export interface SeatedTable {
  branchId: string;
  table: string;
}

export function tableCookieName(slug: string): string {
  return `${TABLE_COOKIE_PREFIX}${slug.replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A table label as printed on a QR code: letters, digits, spaces and dashes, up to 12 ("12", "T4", "Terrace 3"). */
export function normaliseTable(value: string | null | undefined): string | null {
  const table = (value ?? "").trim().replace(/\s+/g, " ");
  return /^[\p{L}\p{N}][\p{L}\p{N} -]{0,11}$/u.test(table) ? table : null;
}

/** `<branchId>~<table>`. The cookie layer (Next's cookies().set/get) does the URL-encoding, so it is not done here too. */
export function encodeSeatedTable(seat: SeatedTable): string {
  return `${seat.branchId}~${seat.table}`;
}

/** Tolerant: anything unreadable is simply "not seated". */
export function decodeSeatedTable(value: string | null | undefined): SeatedTable | null {
  if (!value) return null;
  const [branchId, table] = value.split("~");
  const label = normaliseTable(table);
  return branchId && UUID.test(branchId) && label ? { branchId, table: label } : null;
}

export const ARRIVAL_LEAD_MINUTES = 15;
const ARRIVAL_STEP_MINUTES = 15;
const ARRIVAL_HORIZON_HOURS = 6;

export interface ArrivalSlot {
  /** ISO instant, what the form sends */
  value: string;
  /** "7:30 PM", or "Tomorrow, 12:15 AM" once past midnight, on the restaurant's clock */
  label: string;
}

/** When an order-ahead dine-in guest can arrive: every 15 minutes from 15 minutes out, for 6 hours, while the branch is open. */
export function arrivalSlots(hours: OpeningHours, timeZone: string, locale: string, now: Date = new Date()): ArrivalSlot[] {
  const step = ARRIVAL_STEP_MINUTES * 60_000;
  const first = Math.ceil((now.getTime() + ARRIVAL_LEAD_MINUTES * 60_000) / step) * step;
  const last = now.getTime() + ARRIVAL_HORIZON_HOURS * 3_600_000;
  const today = zonedNow(now, timeZone).dateKey;
  const time = new Intl.DateTimeFormat(locale, { timeZone, hour: "numeric", minute: "2-digit" });
  const slots: ArrivalSlot[] = [];
  for (let instant = first; instant <= last; instant += step) {
    const at = new Date(instant);
    if (!acceptsOrdersAt(hours, at, timeZone)) continue;
    const label = time.format(at);
    slots.push({ value: at.toISOString(), label: zonedNow(at, timeZone).dateKey === today ? label : `Tomorrow, ${label}` });
  }
  return slots;
}

/** Why `arrivalAt` cannot be accepted for an order-ahead dine-in order, or null when it can. */
export function arrivalProblem(arrivalAt: string | null | undefined, hours: OpeningHours, timeZone: string, now: Date = new Date()): string | null {
  if (!arrivalAt) return "Please choose when you'll arrive.";
  const at = new Date(arrivalAt);
  if (Number.isNaN(at.getTime())) return "Please choose when you'll arrive.";
  // a few minutes of slack: the form may have been open a little while
  if (at.getTime() < now.getTime() + (ARRIVAL_LEAD_MINUTES - 10) * 60_000) {
    return "That arrival time has passed. Please choose a later time.";
  }
  if (at.getTime() > now.getTime() + (ARRIVAL_HORIZON_HOURS * 60 + ARRIVAL_STEP_MINUTES) * 60_000) {
    return `Dine-in orders can be placed up to ${ARRIVAL_HORIZON_HOURS} hours ahead.`;
  }
  if (!acceptsOrdersAt(hours, at, timeZone)) return "The branch is closed at that time. Please choose another time.";
  return null;
}
