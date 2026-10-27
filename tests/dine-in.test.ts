import { describe, expect, it } from "vitest";
import { arrivalProblem, arrivalSlots, decodeSeatedTable, encodeSeatedTable, normaliseTable } from "@/shared/dine-in";

/** Dine-in: arrival choices for ordering ahead, and the table a QR code seats a phone at (shared/dine-in.ts). DB-free. */
const KARACHI = "Asia/Karachi"; // UTC+5, no DST
const NOON_TO_ELEVEN = Object.fromEntries(["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((day) => [day, [{ open: "12:00", close: "23:00" }]]));
const karachi = (time: string) => new Date(`2026-10-09T${time}:00+05:00`);
const BRANCH = "0b0e7a52-1111-4a11-8a11-111111111111";

describe("arrival times for dine-in ordered ahead", () => {
  it("every 15 minutes from at least 15 minutes out, while the branch is open, up to 6 hours", () => {
    const slots = arrivalSlots(NOON_TO_ELEVEN, KARACHI, "en-GB", karachi("19:07"));
    expect(slots[0]!.value).toBe(karachi("19:30").toISOString()); // 19:22 rounded up to the next quarter
    expect(slots.at(-1)!.value).toBe(karachi("22:45").toISOString()); // closes at 23:00
    expect(slots).toHaveLength(14);
    expect(slots[0]!.label).toBe("19:30");
  });

  it("none once the branch has closed for the night; 'Tomorrow' past midnight for a late-night branch", () => {
    expect(arrivalSlots(NOON_TO_ELEVEN, KARACHI, "en-GB", karachi("22:50"))).toEqual([]);
    const allDay = Object.fromEntries(["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((day) => [day, [{ open: "00:00", close: "00:00" }]]));
    expect(arrivalSlots(allDay, KARACHI, "en-GB", karachi("23:40")).some((slot) => slot.label.startsWith("Tomorrow"))).toBe(true);
  });

  it("the order accepts only a time it could have been offered", () => {
    const now = karachi("19:00");
    expect(arrivalProblem(karachi("19:30").toISOString(), NOON_TO_ELEVEN, KARACHI, now)).toBeNull();
    expect(arrivalProblem("", NOON_TO_ELEVEN, KARACHI, now)).toMatch(/when you'll arrive/);
    expect(arrivalProblem("tomorrow", NOON_TO_ELEVEN, KARACHI, now)).toMatch(/when you'll arrive/);
    expect(arrivalProblem(karachi("18:45").toISOString(), NOON_TO_ELEVEN, KARACHI, now)).toMatch(/passed/);
    expect(arrivalProblem(karachi("23:15").toISOString(), NOON_TO_ELEVEN, KARACHI, now)).toMatch(/closed/);
    expect(arrivalProblem(new Date(now.getTime() + 8 * 3_600_000).toISOString(), {}, KARACHI, now)).toMatch(/6 hours/);
  });
});

describe("the table a QR code seats this phone at", () => {
  it("round-trips a branch and table label", () => {
    expect(decodeSeatedTable(encodeSeatedTable({ branchId: BRANCH, table: "Terrace 3" }))).toEqual({ branchId: BRANCH, table: "Terrace 3" });
  });

  it("accepts short printed labels only, and anything unreadable means 'not seated'", () => {
    expect(normaliseTable(" T12 ")).toBe("T12");
    expect(normaliseTable("Terrace   3")).toBe("Terrace 3");
    expect(normaliseTable("<script>")).toBeNull();
    expect(normaliseTable("a".repeat(13))).toBeNull();
    expect(decodeSeatedTable(`not-a-uuid~12`)).toBeNull();
    expect(decodeSeatedTable(`${BRANCH}~`)).toBeNull();
    expect(decodeSeatedTable("%E0%A4%A")).toBeNull(); // junk
    expect(decodeSeatedTable(`${BRANCH}~Terrace%202`)).toBeNull(); // never double-encoded: the cookie layer encodes once
  });
});
