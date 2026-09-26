import { describe, expect, it } from "vitest";
import { serviceStatus } from "@/components/storefront/service-status";
import { formatHours, isOpenAt, parseOpeningHours } from "@/shared/hours";

const tz = "UTC";
const hours = {
  mon: [{ open: "12:00", close: "23:30" }],
  tue: [{ open: "12:00", close: "23:30" }],
  wed: [{ open: "12:00", close: "23:30" }],
  thu: [{ open: "12:00", close: "23:30" }],
  fri: [{ open: "13:00", close: "00:30" }],
  sat: [],
  sun: [],
} as never;
// 2026-09-21 is a Monday
const at = (iso: string) => new Date(`${iso}Z`);

describe("serviceStatus (storefront open / closing / closed)", () => {
  it("is open with the closing time inside a window", () => {
    expect(serviceStatus(hours, at("2026-09-21T15:00:00"), tz)).toEqual({ state: "open", headline: "Open now", detail: "until 11:30pm" });
  });
  it("flags closing soon in the last 45 minutes", () => {
    expect(serviceStatus(hours, at("2026-09-21T23:00:00"), tz).state).toBe("closing");
  });
  it("names the next opening later today, tomorrow, or a later day", () => {
    expect(serviceStatus(hours, at("2026-09-21T09:00:00"), tz).detail).toBe("opens 12pm");
    expect(serviceStatus(hours, at("2026-09-21T23:50:00"), tz).detail).toBe("opens tomorrow 12pm");
    expect(serviceStatus(hours, at("2026-09-26T10:00:00"), tz).detail).toBe("opens Monday 12pm");
  });
  it("keeps an overnight window open after midnight", () => {
    // Saturday 00:10, Friday's window runs to 00:30
    expect(serviceStatus(hours, at("2026-09-26T00:10:00"), tz)).toMatchObject({ state: "closing", detail: "until 12:30am" });
  });
  it("treats 00:00-23:59 (as typed in the DB) as open 24 hours", () => {
    const allDay = parseOpeningHours({ mon: [{ open: "00:00", close: "23:59" }] });
    expect(serviceStatus(allDay, at("2026-09-21T23:30:00"), tz)).toEqual({ state: "open", headline: "Open now", detail: "24 hours" });
    expect(isOpenAt(allDay, at("2026-09-21T23:59:30"), tz)).toBe(true);
    expect(formatHours(allDay).find((row) => row.day === "mon")?.text).toBe("Open 24 hours");
  });
});
