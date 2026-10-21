import { ORDER_TYPES, PAYMENT_STATUSES, type OrderType, type PaymentStatus } from "@/shared/contract/enums";

/**
 * The admin Orders screen's extra filters, read from the URL (`type`, `pay`, `from`, `to`). Anything that is not a
 * known value is dropped, so a hand-edited URL can never reach the SQL as an unknown enum or date.
 */
export interface AdminOrderFilters {
  orderType?: OrderType;
  paymentStatus?: PaymentStatus;
  /** YYYY-MM-DD, inclusive, in the restaurant's time zone */
  dateFrom?: string;
  dateTo?: string;
}

export interface AdminOrderFilterParams {
  type?: string;
  pay?: string;
  from?: string;
  to?: string;
}

function dateKey(value: string | undefined): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  // rejects 2026-02-31 and friends (Date would roll it over into March)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : undefined;
}

export function parseAdminOrderFilters(params: AdminOrderFilterParams): AdminOrderFilters {
  const filters: AdminOrderFilters = {};
  if ((ORDER_TYPES as readonly string[]).includes(params.type ?? "")) filters.orderType = params.type as OrderType;
  if ((PAYMENT_STATUSES as readonly string[]).includes(params.pay ?? "")) filters.paymentStatus = params.pay as PaymentStatus;
  let from = dateKey(params.from);
  let to = dateKey(params.to);
  if (from && to && from > to) [from, to] = [to, from];
  if (from) filters.dateFrom = from;
  if (to) filters.dateTo = to;
  return filters;
}

export function hasAdminOrderFilters(filters: AdminOrderFilters): boolean {
  return Boolean(filters.orderType || filters.paymentStatus || filters.dateFrom || filters.dateTo);
}

/** Back to URL parameters (for tab, pagination and clear links that keep the filters). */
export function adminOrderFilterSearch(filters: AdminOrderFilters): [string, string][] {
  const entries: [string, string][] = [];
  if (filters.orderType) entries.push(["type", filters.orderType]);
  if (filters.paymentStatus) entries.push(["pay", filters.paymentStatus]);
  if (filters.dateFrom) entries.push(["from", filters.dateFrom]);
  if (filters.dateTo) entries.push(["to", filters.dateTo]);
  return entries;
}
