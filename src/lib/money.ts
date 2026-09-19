import Decimal from "decimal.js";
import type { Money } from "./contract/models";

/**
 * Money is ALWAYS handled with decimal.js — never with binary floats.
 * Values travel as strings and are rounded HALF_UP to 2 decimal places.
 */
Decimal.set({ precision: 24, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -9, toExpPos: 21 });

export const ZERO = new Decimal(0);

export type MoneyInput = Money | number | Decimal | null | undefined;

export function dec(value: MoneyInput): Decimal {
  if (value === null || value === undefined || value === "") return new Decimal(0);
  if (value instanceof Decimal) return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return new Decimal(0);
    return new Decimal(value.toString());
  }
  try {
    return new Decimal(value);
  } catch {
    return new Decimal(0);
  }
}

/** Round to 2 decimals, HALF_UP. */
export function round2(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Serialise for PostgreSQL numeric columns / JSON payloads. */
export function toMoney(value: MoneyInput): Money {
  return round2(dec(value)).toFixed(2);
}

export function sumMoney(values: MoneyInput[]): Decimal {
  return values.reduce<Decimal>((acc, value) => acc.plus(dec(value)), ZERO);
}

export function moneyEquals(a: MoneyInput, b: MoneyInput): boolean {
  return round2(dec(a)).equals(round2(dec(b)));
}

export function isPositive(value: MoneyInput): boolean {
  return dec(value).greaterThan(0);
}

export function maxMoney(a: MoneyInput, b: MoneyInput): Decimal {
  const left = dec(a);
  const right = dec(b);
  return left.greaterThan(right) ? left : right;
}

export function minMoney(a: MoneyInput, b: MoneyInput): Decimal {
  const left = dec(a);
  const right = dec(b);
  return left.lessThan(right) ? left : right;
}

export function percentageOf(base: MoneyInput, ratePercent: MoneyInput): Decimal {
  return round2(dec(base).times(dec(ratePercent)).dividedBy(100));
}

/** Split a tax-inclusive amount into its net + tax parts. */
export function extractIncludedTax(gross: MoneyInput, ratePercent: MoneyInput): { net: Decimal; tax: Decimal } {
  const rate = dec(ratePercent);
  const grossAmount = dec(gross);
  if (rate.lessThanOrEqualTo(0)) return { net: round2(grossAmount), tax: ZERO };
  const net = round2(grossAmount.dividedBy(new Decimal(1).plus(rate.dividedBy(100))));
  return { net, tax: round2(grossAmount.minus(net)) };
}

export interface CurrencyFormatOptions {
  currency: string;
  symbol?: string | null;
  locale?: string;
  /** hide ".00" for whole amounts (common for PKR) */
  compact?: boolean;
}

export function formatMoney(value: MoneyInput, options: CurrencyFormatOptions): string {
  const amount = round2(dec(value));
  const locale = options.locale || "en-US";
  const hasFraction = !amount.isInteger();
  const showFraction = !options.compact || hasFraction;

  let formatted: string;
  try {
    formatted = new Intl.NumberFormat(locale, {
      minimumFractionDigits: showFraction ? 2 : 0,
      maximumFractionDigits: 2,
    }).format(amount.toNumber());
  } catch {
    formatted = amount.toFixed(showFraction ? 2 : 0);
  }

  const symbol = options.symbol?.trim();
  if (symbol) return `${symbol} ${formatted}`;

  const code = options.currency?.toUpperCase() || "USD";
  return `${code} ${formatted}`;
}

/** Compact money for charts and KPI tiles, e.g. Rs 12.4k */
export function formatMoneyCompact(value: MoneyInput, options: CurrencyFormatOptions): string {
  const amount = dec(value);
  const symbol = options.symbol?.trim() || options.currency?.toUpperCase() || "";
  const abs = amount.abs();
  if (abs.greaterThanOrEqualTo(1_000_000)) return `${symbol} ${amount.dividedBy(1_000_000).toDecimalPlaces(1).toString()}M`;
  if (abs.greaterThanOrEqualTo(1_000)) return `${symbol} ${amount.dividedBy(1_000).toDecimalPlaces(1).toString()}k`;
  return formatMoney(amount, { ...options, compact: true });
}

export function parseMoneyInput(value: unknown): Decimal {
  if (typeof value === "number" && Number.isFinite(value)) return round2(new Decimal(value.toString()));
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9.\-]/g, "");
    return round2(dec(cleaned));
  }
  return ZERO;
}
