"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/shared/contract/enums";
import { formatMoney } from "@/shared/money";

/** Shared chart styling: reads the app's own CSS variables so it matches both themes without its own palette. */
const TICK_STYLE = { fontSize: 12, fill: "var(--color-muted-ink)" };

function shortDate(dateKey: string): string {
  const [, month, day] = dateKey.split("-");
  const date = new Date(`${dateKey}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return `${month}/${day}`;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function ChartTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean;
  payload?: { value: number; name: string; dataKey: string }[];
  label?: string;
  currency: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="surface-card px-3 py-2 text-xs shadow-[var(--shadow-card)]">
      <p className="font-medium">{label ? shortDate(label) : ""}</p>
      {payload.map((entry) => (
        <p key={entry.dataKey} className="text-[var(--color-muted-ink)]">
          {entry.dataKey === "sales" ? formatMoney(String(entry.value), { currency }) : `${entry.value} orders`}
        </p>
      ))}
    </div>
  );
}

/** Daily sales (line) over the selected range. */
export function SalesTrendChart({ data, currency }: { data: { date: string; sales: string }[]; currency: string }) {
  const points = data.map((point) => ({ date: point.date, sales: Number(point.sales) }));
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--rule)" vertical={false} />
        <XAxis dataKey="date" tickFormatter={shortDate} tick={TICK_STYLE} tickLine={false} axisLine={{ stroke: "var(--rule)" }} />
        <YAxis tick={TICK_STYLE} tickLine={false} axisLine={false} width={40} />
        <Tooltip content={<ChartTooltip currency={currency} />} />
        <Line type="monotone" dataKey="sales" stroke="var(--color-brand-accent)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Orders placed per day over the selected range. */
export function OrdersTrendChart({ data }: { data: { date: string; orders: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--rule)" vertical={false} />
        <XAxis dataKey="date" tickFormatter={shortDate} tick={TICK_STYLE} tickLine={false} axisLine={{ stroke: "var(--rule)" }} />
        <YAxis tick={TICK_STYLE} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
        <Tooltip content={<ChartTooltip currency="" />} />
        <Bar dataKey="orders" fill="var(--color-brand)" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Payment-method breakdown as a simple ranked bar list (completed orders only). No colour legend to keep track of. */
export function PaymentBreakdownList({
  rows,
  currency,
}: {
  rows: { method: PaymentMethod; orders: number; amount: string }[];
  currency: string;
}) {
  const max = Math.max(1, ...rows.map((row) => Number(row.amount)));
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.method}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium">{PAYMENT_METHOD_LABELS[row.method]}</span>
            <span className="tabular text-[var(--color-muted-ink)]">
              {formatMoney(row.amount, { currency })} · {row.orders} order{row.orders === 1 ? "" : "s"}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--tint-strong)]">
            <div
              className="h-full rounded-full bg-[var(--color-brand-accent)]"
              style={{ width: `${Math.max(2, (Number(row.amount) / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
