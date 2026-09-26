import { describe, expect, it } from "vitest";
import { dateOnly, mapReservation } from "@/server/db/mappers";
import { formatDateKey } from "@/shared/hours";

// node-postgres turns a `date` column into a Date at LOCAL midnight; these tests build the same value.
const pgDate = (y: number, m: number, d: number) => new Date(y, m - 1, d);

describe("dateOnly (Postgres date -> YYYY-MM-DD)", () => {
  it("keeps the calendar day of a pg Date, whatever the process time zone", () => {
    expect(dateOnly(pgDate(2026, 9, 26))).toBe("2026-09-26");
    expect(dateOnly(pgDate(2026, 1, 1))).toBe("2026-01-01");
    expect(dateOnly(pgDate(2026, 12, 31))).toBe("2026-12-31");
  });

  it("passes strings through (to_char / text parsers)", () => {
    expect(dateOnly("2026-09-26")).toBe("2026-09-26");
    expect(dateOnly("2026-09-26T00:00:00.000Z")).toBe("2026-09-26");
    expect(dateOnly(null)).toBe("");
  });

  it("maps a reservation row to an ISO date key, not Date#toString", () => {
    const reservation = mapReservation({
      id: "r1",
      restaurant_id: "x",
      location_id: "l",
      confirmation_code: "ABC123",
      guest_name: "A",
      guest_phone: "1",
      reservation_date: pgDate(2026, 9, 26),
      reservation_time: "19:30:00",
      guests: 2,
      status: "pending",
      created_at: new Date(),
    });
    expect(reservation.reservationDate).toBe("2026-09-26");
  });
});

describe("formatDateKey", () => {
  it("formats a date key without shifting the day", () => {
    expect(formatDateKey("2026-09-26", "en-GB", { day: "numeric", month: "short" })).toBe("26 Sept");
  });

  it("returns anything that is not a date key unchanged", () => {
    expect(formatDateKey("Sat Sep 26", "en-GB")).toBe("Sat Sep 26");
  });
});
