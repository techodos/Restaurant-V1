"use client";

import { Clock, Copy, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminSwitch } from "@/components/admin/admin-switch";
import type { DayKey } from "@/shared/contract/enums";
import type { DayHours, OpeningHours } from "@/shared/contract/models";

/**
 * A branch's opening hours in the Locations form. `{}` = not set: the branch then takes orders at any time
 * (shared/hours.ts#acceptsOrdersAt) and has no reservation slots. Per day: closed, open 24 hours (open === close),
 * or one to three windows (lunch + dinner); a window whose close is before its open runs past midnight.
 */

const WEEK: { key: DayKey; label: string }[] = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
];
const DEFAULT_WINDOW: DayHours = { open: "11:00", close: "23:00" };
const ALL_DAY: DayHours = { open: "00:00", close: "00:00" };
const isAllDay = (windows: DayHours[]) => windows.length === 1 && windows[0]!.open === windows[0]!.close;

export function OpeningHoursEditor({ value, onChange, error }: { value: OpeningHours; onChange: (hours: OpeningHours) => void; error?: string }) {
  const set = (day: DayKey, windows: DayHours[]) => onChange({ ...value, [day]: windows });

  // "not set" is only an empty object (Clear hours); every day switched off stays here and the server refuses it
  if (Object.keys(value).length === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-brand)] border border-dashed border-[var(--color-hairline)] px-4 py-3">
        <p className="text-sm text-[var(--color-muted-ink)]">
          <Clock className="mr-1.5 inline size-4 align-[-3px]" aria-hidden />
          No opening hours set: this branch takes orders at any time and offers no reservation slots.
        </p>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={() => onChange(Object.fromEntries(WEEK.map(({ key }) => [key, [ALL_DAY]])))}>
            Open 24 hours
          </Button>
          <Button type="button" size="sm" onClick={() => onChange(Object.fromEntries(WEEK.map(({ key }) => [key, [DEFAULT_WINDOW]])))}>
            Set opening hours
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <ul className="divide-y divide-[var(--color-hairline)] rounded-[var(--radius-brand)] border border-[var(--color-hairline)]">
        {WEEK.map(({ key, label }, index) => {
          const windows = value[key] ?? [];
          const open = windows.length > 0;
          const allDay = open && isAllDay(windows);
          return (
            <li key={key} className="grid grid-cols-[minmax(0,1fr)] gap-2 px-3 py-2.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-center">
              <div className="flex items-center gap-2.5">
                <AdminSwitch checked={open} onChange={(on) => set(key, on ? [DEFAULT_WINDOW] : [])} aria-label={`${label} open`} />
                <span className="text-sm font-medium">{label}</span>
              </div>
              {!open ? (
                <span className="text-sm text-[var(--color-muted-ink)]">Closed</span>
              ) : (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <label className="flex items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={allDay} onChange={(event) => set(key, event.target.checked ? [ALL_DAY] : [DEFAULT_WINDOW])} />
                    24 hours
                  </label>
                  {allDay
                    ? null
                    : windows.map((window, position) => (
                        <span key={position} className="flex items-center gap-1.5">
                          <input
                            type="time"
                            aria-label={`${label} opens`}
                            value={window.open}
                            onChange={(event) => set(key, windows.map((w, i) => (i === position ? { ...w, open: event.target.value } : w)))}
                            className="h-9 rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] px-2 text-sm"
                            required
                          />
                          <span className="text-sm text-[var(--color-muted-ink)]">to</span>
                          <input
                            type="time"
                            aria-label={`${label} closes`}
                            value={window.close}
                            onChange={(event) => set(key, windows.map((w, i) => (i === position ? { ...w, close: event.target.value } : w)))}
                            className="h-9 rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] px-2 text-sm"
                            required
                          />
                          {windows.length > 1 ? (
                            <Button type="button" size="icon" variant="ghost" aria-label={`Remove this ${label} time`} onClick={() => set(key, windows.filter((_, i) => i !== position))}>
                              <X className="size-4" aria-hidden />
                            </Button>
                          ) : null}
                        </span>
                      ))}
                  {!allDay && windows.length < 3 ? (
                    <Button type="button" size="sm" variant="ghost" onClick={() => set(key, [...windows, { open: "18:00", close: "23:00" }])}>
                      <Plus className="size-4" aria-hidden /> Split
                    </Button>
                  ) : null}
                  {index === 0 ? (
                    <Button type="button" size="sm" variant="ghost" onClick={() => onChange(Object.fromEntries(WEEK.map(({ key: day }) => [day, windows])))}>
                      <Copy className="size-4" aria-hidden /> Copy to all days
                    </Button>
                  ) : null}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--color-muted-ink)]">Times are the restaurant&apos;s local time. A closing time before the opening time runs past midnight.</p>
        <Button type="button" size="sm" variant="link" onClick={() => onChange({})}>
          Clear hours
        </Button>
      </div>
      {error ? <p className="text-xs text-[var(--color-danger)]">{error}</p> : null}
    </div>
  );
}
