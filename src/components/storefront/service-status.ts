import { DAY_KEYS, type DayKey } from "@/shared/contract/enums";
import type { OpeningHours } from "@/shared/contract/models";
import { timeToMinutes, to12Hour, zonedNow } from "@/shared/hours";

export interface ServiceStatus {
  state: "open" | "closing" | "closed";
  /** e.g. "Open now", "Closing soon", "Closed" */
  headline: string;
  /** e.g. "until 11:30pm", "opens 12pm", "opens Monday 1pm" */
  detail: string | null;
}

const CLOSING_SOON_MINUTES = 45;
const DAY_NAMES: Record<DayKey, string> = {
  sun: "Sunday", mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday",
};

/**
 * Presentation of the restaurant's real opening hours for "right now": the storefront reflects the
 * hour (open, closing soon, closed and when it opens next). Pure; reads only the location's hours.
 */
export function serviceStatus(hours: OpeningHours, date: Date, timeZone: string): ServiceStatus {
  const now = zonedNow(date, timeZone);
  const dayIndex = DAY_KEYS.indexOf(now.dayKey);

  // windows that cover "now": today's, plus yesterday's that run past midnight
  const candidates: { closeIn: number; close: string }[] = [];
  for (const window of hours[now.dayKey] ?? []) {
    const open = timeToMinutes(window.open);
    const close = timeToMinutes(window.close);
    if (open === close) return { state: "open", headline: "Open now", detail: "24 hours" };
    const end = close > open ? close : close + 1440;
    if (now.minutes >= open && now.minutes < end) candidates.push({ closeIn: end - now.minutes, close: window.close });
  }
  const yesterday = DAY_KEYS[(dayIndex + 6) % 7] as DayKey;
  for (const window of hours[yesterday] ?? []) {
    const open = timeToMinutes(window.open);
    const close = timeToMinutes(window.close);
    if (close < open && now.minutes < close) candidates.push({ closeIn: close - now.minutes, close: window.close });
  }

  const current = candidates.sort((a, b) => b.closeIn - a.closeIn)[0];
  if (current) {
    const closing = current.closeIn <= CLOSING_SOON_MINUTES;
    return {
      state: closing ? "closing" : "open",
      headline: closing ? "Closing soon" : "Open now",
      detail: `until ${to12Hour(current.close)}`,
    };
  }

  // next opening: later today, else the next day that has hours
  for (let offset = 0; offset < 7; offset += 1) {
    const day = DAY_KEYS[(dayIndex + offset) % 7] as DayKey;
    const next = (hours[day] ?? [])
      .map((window) => timeToMinutes(window.open))
      .filter((open) => offset > 0 || open > now.minutes)
      .sort((a, b) => a - b)[0];
    if (next !== undefined) {
      const time = to12Hour(`${String(Math.floor(next / 60)).padStart(2, "0")}:${String(next % 60).padStart(2, "0")}`);
      const when = offset === 0 ? "" : offset === 1 ? "tomorrow " : `${DAY_NAMES[day]} `;
      return { state: "closed", headline: "Closed", detail: `opens ${when}${time}` };
    }
  }
  return { state: "closed", headline: "Closed", detail: null };
}
