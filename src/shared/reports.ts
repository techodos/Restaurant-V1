import { zonedNow } from "@/shared/hours";
import { ORDER_STATUS_LABELS, ORDER_TYPE_LABELS, PAYMENT_METHOD_LABELS, type OrderStatus, type OrderType, type PaymentMethod } from "@/shared/contract/enums";
import type { Money } from "@/shared/contract/models";

/**
 * Admin "Sales Reports" date-range and CSV helpers. Pure (no I/O, no framework) so the same
 * logic resolves a preset on the server (the page) and the export route identically.
 */

export const REPORT_RANGE_PRESETS = ["today", "yesterday", "last7", "last30", "thisMonth", "lastMonth", "custom"] as const;
export type ReportRangePreset = (typeof REPORT_RANGE_PRESETS)[number];

export const REPORT_RANGE_LABELS: Record<ReportRangePreset, string> = {
  today: "Today",
  yesterday: "Yesterday",
  last7: "Last 7 days",
  last30: "Last 30 days",
  thisMonth: "This month",
  lastMonth: "Previous month",
  custom: "Custom range",
};

export interface ReportRange {
  preset: ReportRangePreset;
  /** inclusive, restaurant-local calendar date, YYYY-MM-DD */
  fromDateKey: string;
  /** inclusive, restaurant-local calendar date, YYYY-MM-DD */
  toDateKey: string;
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isDateKey = (value: unknown): value is string => typeof value === "string" && DATE_KEY_RE.test(value);

function splitDateKey(dateKey: string): { year: number; month: number; day: number } {
  const parts = dateKey.split("-").map(Number);
  return { year: parts[0] ?? 1970, month: parts[1] ?? 1, day: parts[2] ?? 1 };
}

function addDays(dateKey: string, days: number): string {
  const { year, month, day } = splitDateKey(dateKey);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** First day of the month `offsetMonths` away from `dateKey`'s month (0 = same month). */
function monthStart(dateKey: string, offsetMonths = 0): string {
  const { year, month } = splitDateKey(dateKey);
  return new Date(Date.UTC(year, month - 1 + offsetMonths, 1)).toISOString().slice(0, 10);
}

/** Last day of the month `offsetMonths` away from `dateKey`'s month. */
function monthEnd(dateKey: string, offsetMonths = 0): string {
  const { year, month } = splitDateKey(dateKey);
  // day 0 of the following month = the last day of the target month
  return new Date(Date.UTC(year, month + offsetMonths, 0)).toISOString().slice(0, 10);
}

/**
 * Resolves a preset (or an explicit custom pair) to a concrete [from, to] range of restaurant-local
 * calendar dates. An invalid/missing preset falls back to "today"; an invalid custom pair falls back
 * to today as well rather than silently showing an unbounded or reversed range.
 */
export function resolveReportRange(
  preset: string | null | undefined,
  customFrom: string | null | undefined,
  customTo: string | null | undefined,
  timezone: string,
  now = new Date(),
): ReportRange {
  const today = zonedNow(now, timezone).dateKey;

  switch (preset) {
    case "yesterday": {
      const d = addDays(today, -1);
      return { preset: "yesterday", fromDateKey: d, toDateKey: d };
    }
    case "last7":
      return { preset: "last7", fromDateKey: addDays(today, -6), toDateKey: today };
    case "last30":
      return { preset: "last30", fromDateKey: addDays(today, -29), toDateKey: today };
    case "thisMonth":
      return { preset: "thisMonth", fromDateKey: monthStart(today), toDateKey: today };
    case "lastMonth":
      return { preset: "lastMonth", fromDateKey: monthStart(today, -1), toDateKey: monthEnd(today, -1) };
    case "custom": {
      if (isDateKey(customFrom) && isDateKey(customTo)) {
        return customFrom <= customTo
          ? { preset: "custom", fromDateKey: customFrom, toDateKey: customTo }
          : { preset: "custom", fromDateKey: customTo, toDateKey: customFrom };
      }
      return { preset: "today", fromDateKey: today, toDateKey: today };
    }
    default:
      return { preset: "today", fromDateKey: today, toDateKey: today };
  }
}

export interface SalesCsvRow {
  orderNumber: string;
  createdAt: string;
  status: OrderStatus;
  orderType: OrderType;
  customerName: string;
  customerPhone: string;
  itemCount: number;
  subtotal: Money;
  discountAmount: Money;
  taxAmount: Money;
  total: Money;
  paymentMethod: PaymentMethod;
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Text a customer typed (their name). A cell starting with = + - @ (or tab/CR) is a FORMULA to Excel/Sheets, so
 * `=HYPERLINK(...)` or `=cmd|...` would run when staff open the export; a leading ' makes it plain text (OWASP).
 */
export function csvText(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** CSV text (CRLF, Excel-friendly) for the sales export. Never includes anything not already visible to staff. */
export function buildSalesCsv(rows: SalesCsvRow[], restaurant: { locale: string; timezone: string }): string {
  const headers = [
    "Order ID", "Date", "Status", "Order type", "Customer", "Phone",
    "Items", "Subtotal", "Discount", "Tax", "Total", "Payment method",
  ];
  const lines = [headers.join(",")];
  for (const row of rows) {
    let date: string;
    try {
      date = new Date(row.createdAt).toLocaleString(restaurant.locale, {
        timeZone: restaurant.timezone,
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      date = row.createdAt;
    }
    lines.push(
      [
        row.orderNumber,
        date,
        ORDER_STATUS_LABELS[row.status],
        ORDER_TYPE_LABELS[row.orderType],
        csvText(row.customerName),
        row.customerPhone,
        String(row.itemCount),
        row.subtotal,
        row.discountAmount,
        row.taxAmount,
        row.total,
        PAYMENT_METHOD_LABELS[row.paymentMethod],
      ]
        .map((value) => csvCell(String(value)))
        .join(","),
    );
  }
  return lines.join("\r\n");
}
