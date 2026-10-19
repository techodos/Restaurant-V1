"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";
import { Sheet } from "@/components/motion/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/shared/utils";

/**
 * Phones: the Sales reports custom range as one button that opens a bottom-sheet calendar. First tap = From,
 * second tap = To (tapping before From restarts there); days in between are shaded; days after `today` are off.
 * Apply opens `/reports?preset=custom&from=…&to=…`, the same URL the desktop from–to fields submit.
 * Dates are "YYYY-MM-DD" keys in the restaurant's day (`today` comes from the server, in its time zone);
 * the grid does its arithmetic in UTC so the viewer's own zone can never shift a day.
 */

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const toKey = (date: Date) => date.toISOString().slice(0, 10);
const fromKey = (key: string) => new Date(`${key}T00:00:00Z`);
const addMonths = (key: string, months: number) => {
  const date = fromKey(key);
  return toKey(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1)));
};
const label = (key: string, withYear = false) =>
  fromKey(key).toLocaleDateString(undefined, { timeZone: "UTC", day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });

/** Every cell of one month's grid, Monday first; `null` = padding before the 1st. */
function monthCells(monthKey: string): (string | null)[] {
  const first = fromKey(monthKey);
  const year = first.getUTCFullYear();
  const month = first.getUTCMonth();
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  return [...Array.from({ length: lead }, () => null), ...Array.from({ length: days }, (_, index) => toKey(new Date(Date.UTC(year, month, index + 1))))];
}

export function ReportRangePicker({
  action,
  today,
  initialFrom,
  initialTo,
}: {
  /** the reports page path */
  action: string;
  /** today's date key in the restaurant's time zone */
  today: string;
  /** the custom range being shown, if any */
  initialFrom?: string;
  initialTo?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState<string | null>(initialFrom ?? null);
  const [to, setTo] = useState<string | null>(initialTo ?? null);
  const [month, setMonth] = useState(() => `${(initialTo ?? today).slice(0, 7)}-01`);

  function pick(key: string) {
    if (!from || to || key < from) {
      setFrom(key);
      setTo(null);
      return;
    }
    setTo(key);
  }

  function apply() {
    if (!from) return;
    setOpen(false);
    router.push(`${action}?${new URLSearchParams({ preset: "custom", from, to: to ?? from }).toString()}`);
  }

  const applied = initialFrom && initialTo;
  const monthName = fromKey(month).toLocaleDateString(undefined, { timeZone: "UTC", month: "long", year: "numeric" });
  const canGoNext = addMonths(month, 1) <= today;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "flex min-h-12 w-full items-center gap-3 rounded-full bg-[var(--color-surface)] px-4 text-left shadow-[0_1px_2px_color-mix(in_srgb,var(--color-ink)_6%,transparent)] ring-1 transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-brand)]",
          applied ? "ring-[var(--color-brand)]" : "ring-[var(--admin-line,var(--color-hairline))]",
        )}
      >
        <CalendarRange className="size-[18px] shrink-0 text-[var(--color-brand)]" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[var(--color-muted-ink)]">Custom range</span>
          <span className="block truncate text-[14.5px] font-semibold">
            {applied ? (initialFrom === initialTo ? label(initialFrom, true) : `${label(initialFrom)} – ${label(initialTo, true)}`) : "Select date range"}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-[var(--color-muted-ink)]" aria-hidden />
      </button>

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Select date range"
        footer={
          <div className="flex gap-2 border-t border-[var(--color-hairline)] px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setFrom(null);
                setTo(null);
              }}
              disabled={!from}
            >
              Clear
            </Button>
            <Button type="button" onClick={apply} disabled={!from} className="flex-1">
              {from ? `Show ${to && to !== from ? `${label(from)} – ${label(to)}` : label(from)}` : "Pick a start date"}
            </Button>
          </div>
        }
      >
        <div className="px-5 pb-5">
          {/* what is chosen so far, and which tap comes next */}
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["From", from, !from || Boolean(to)],
                ["To", to, Boolean(from) && !to],
              ] as const
            ).map(([name, value, next]) => (
              <div
                key={name}
                className={cn(
                  "rounded-2xl px-3.5 py-2.5 ring-1 ring-inset",
                  next ? "bg-[color-mix(in_srgb,var(--color-brand)_8%,var(--color-surface))] ring-[var(--color-brand)]" : "bg-[var(--color-surface)] ring-[var(--color-hairline)]",
                )}
              >
                <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[var(--color-muted-ink)]">{name}</p>
                <p className={cn("text-[15px] font-semibold", !value && "text-[var(--color-muted-ink)]")}>
                  {value ? label(value, true) : next ? "Tap a day" : "—"}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMonth(addMonths(month, -1))}
              aria-label="Previous month"
              className="grid size-11 place-items-center rounded-full hover:bg-[var(--tint-strong)] focus-visible:outline-2 focus-visible:outline-[var(--color-brand)]"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <p className="text-[15px] font-semibold" aria-live="polite">
              {monthName}
            </p>
            <button
              type="button"
              onClick={() => setMonth(addMonths(month, 1))}
              disabled={!canGoNext}
              aria-label="Next month"
              className="grid size-11 place-items-center rounded-full hover:bg-[var(--tint-strong)] focus-visible:outline-2 focus-visible:outline-[var(--color-brand)] disabled:opacity-30"
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>
          </div>

          <div className="mt-2 grid grid-cols-7 text-center text-[12px] font-semibold text-[var(--color-muted-ink)]" aria-hidden>
            {WEEKDAYS.map((day) => (
              <span key={day} className="py-1.5">
                {day}
              </span>
            ))}
          </div>
          <div role="grid" aria-label={monthName} className="grid grid-cols-7 gap-y-1">
            {monthCells(month).map((key, index) => {
              if (!key) return <span key={`pad-${index}`} />;
              const future = key > today;
              const isFrom = key === from;
              const isTo = key === to;
              const inside = Boolean(from && to && key > from && key < to);
              const ends = isFrom || isTo;
              return (
                <span
                  key={key}
                  role="gridcell"
                  className={cn(
                    "relative flex justify-center",
                    // the shaded band runs between the two ends
                    inside && "bg-[color-mix(in_srgb,var(--color-brand)_12%,transparent)]",
                    isFrom && to && to !== from && "bg-[linear-gradient(90deg,transparent_50%,color-mix(in_srgb,var(--color-brand)_12%,transparent)_50%)]",
                    isTo && from !== to && "bg-[linear-gradient(90deg,color-mix(in_srgb,var(--color-brand)_12%,transparent)_50%,transparent_50%)]",
                  )}
                >
                  <button
                    type="button"
                    disabled={future}
                    onClick={() => pick(key)}
                    aria-pressed={ends}
                    aria-label={`${label(key, true)}${isFrom ? ", start" : ""}${isTo ? ", end" : ""}`}
                    className={cn(
                      "tabular grid size-11 place-items-center rounded-full text-[15px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-brand)] disabled:cursor-not-allowed disabled:opacity-30",
                      ends
                        ? "bg-[var(--color-brand)] font-semibold text-[var(--color-brand-foreground)]"
                        : key === today
                          ? "font-semibold text-[var(--color-brand)] ring-1 ring-inset ring-[var(--color-brand)]"
                          : "hover:bg-[var(--tint-strong)]",
                    )}
                  >
                    {Number(key.slice(8))}
                  </button>
                </span>
              );
            })}
          </div>
          <p className="mt-3 text-[13px] text-[var(--color-muted-ink)]">
            {!from ? "Tap the first day of the range." : !to ? "Now tap the last day — or Show for just this day." : "Tap a day to start a new range."}
          </p>
        </div>
      </Sheet>
    </>
  );
}
