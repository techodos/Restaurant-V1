import { DAY_KEYS, type DayKey } from "@/shared/contract/enums";
import type { AvailabilityWindow, DayHours, OpeningHours } from "@/shared/contract/models";

/**
 * Opening-hours and menu-availability helpers. All comparisons are done in the
 * restaurant's own timezone (restaurants.timezone) so a venue in Karachi and a
 * venue in London behave identically.
 */

export function parseOpeningHours(raw: unknown): OpeningHours {
  if (!raw || typeof raw !== "object") return {};
  const result: OpeningHours = {};
  for (const day of DAY_KEYS) {
    const value = (raw as Record<string, unknown>)[day];
    if (!Array.isArray(value)) continue;
    const windows: DayHours[] = [];
    for (const entry of value) {
      if (!entry || typeof entry !== "object") continue;
      const open = (entry as Record<string, unknown>).open;
      const close = (entry as Record<string, unknown>).close;
      if (typeof open !== "string" || typeof close !== "string") continue;
      if (!isTimeString(open) || !isTimeString(close)) continue;
      windows.push({ open, close });
    }
    if (windows.length) result[day] = windows;
  }
  return result;
}

export function isTimeString(value: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

/** Minutes since midnight for "HH:MM". */
export function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":");
  return Number.parseInt(hours ?? "0", 10) * 60 + Number.parseInt(minutes ?? "0", 10);
}

export function minutesToTime(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export interface ZonedNow {
  dayKey: DayKey;
  minutes: number;
  dateKey: string;
}

/** Current weekday/time in a given IANA timezone. */
export function zonedNow(date: Date, timeZone: string): ZonedNow {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const lookup = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";

  const weekday = lookup("weekday").toLowerCase().slice(0, 3);
  const dayKey = (DAY_KEYS as readonly string[]).includes(weekday) ? (weekday as DayKey) : "mon";
  const hour = Number.parseInt(lookup("hour"), 10) % 24;
  const minute = Number.parseInt(lookup("minute"), 10);

  return {
    dayKey,
    minutes: hour * 60 + minute,
    dateKey: `${lookup("year")}-${lookup("month")}-${lookup("day")}`,
  };
}

/** Handles windows that cross midnight (e.g. 18:00 → 02:00). */
export function isWithinWindow(minutes: number, window: DayHours): boolean {
  const open = timeToMinutes(window.open);
  const close = timeToMinutes(window.close);
  if (open === close) return true; // 24h
  if (close > open) return minutes >= open && minutes < close;
  return minutes >= open || minutes < close;
}

export function isOpenAt(hours: OpeningHours, date: Date, timeZone: string): boolean {
  const now = zonedNow(date, timeZone);
  const today = hours[now.dayKey] ?? [];
  if (today.some((window) => isWithinWindow(now.minutes, window))) return true;

  // Overnight spill-over from the previous day
  const index = DAY_KEYS.indexOf(now.dayKey);
  const previousDay = DAY_KEYS[(index + 6) % 7] as DayKey;
  const previous = hours[previousDay] ?? [];
  return previous.some((window) => {
    const open = timeToMinutes(window.open);
    const close = timeToMinutes(window.close);
    if (close > open || close === open) return false;
    return now.minutes < close;
  });
}

export interface HoursRow {
  day: DayKey;
  label: string;
  text: string;
  isToday: boolean;
}

const DAY_LABELS: Record<DayKey, string> = {
  sun: "Sunday",
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
};

const DAY_ORDER: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export function formatHours(hours: OpeningHours, today?: DayKey): HoursRow[] {
  return DAY_ORDER.map((day) => {
    const windows = hours[day] ?? [];
    return {
      day,
      label: DAY_LABELS[day],
      text: windows.length
        ? windows.map((window) => `${to12Hour(window.open)} – ${to12Hour(window.close)}`).join(", ")
        : "Closed",
      isToday: day === today,
    };
  });
}

export function to12Hour(value: string): string {
  const minutes = timeToMinutes(value);
  const hours24 = Math.floor(minutes / 60);
  const minutesPart = minutes % 60;
  const suffix = hours24 >= 12 ? "pm" : "am";
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return minutesPart === 0
    ? `${hours12}${suffix}`
    : `${hours12}:${String(minutesPart).padStart(2, "0")}${suffix}`;
}

export function todayKey(date: Date, timeZone: string): DayKey {
  return zonedNow(date, timeZone).dayKey;
}

/**
 * Menu availability windows (menu_items.availability / menu_categories.availability):
 *   { "days": [1,2,3], "from": "11:00", "to": "15:00" }  — days are JS getDay() numbers.
 */
export function parseAvailabilityWindow(raw: unknown): AvailabilityWindow {
  if (!raw || typeof raw !== "object") return {};
  const value = raw as Record<string, unknown>;
  const window: AvailabilityWindow = {};
  if (Array.isArray(value.days)) {
    const days = value.days
      .map((day) => (typeof day === "number" ? day : Number.parseInt(String(day), 10)))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
    if (days.length) window.days = days;
  }
  if (typeof value.from === "string" && isTimeString(value.from)) window.from = value.from;
  if (typeof value.to === "string" && isTimeString(value.to)) window.to = value.to;
  return window;
}

export function isWindowActive(window: AvailabilityWindow, date: Date, timeZone: string): boolean {
  const hasDays = Array.isArray(window.days) && window.days.length > 0;
  const hasTime = Boolean(window.from && window.to);
  if (!hasDays && !hasTime) return true;

  const now = zonedNow(date, timeZone);
  if (hasDays) {
    const jsDay = DAY_KEYS.indexOf(now.dayKey);
    if (!window.days?.includes(jsDay)) return false;
  }
  if (hasTime && window.from && window.to) {
    return isWithinWindow(now.minutes, { open: window.from, close: window.to });
  }
  return true;
}
