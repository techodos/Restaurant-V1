import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The booking page needs booked slots for every day and location. It must get them
 * in one repository call — one call per day and location cost ~100 s on the hosted
 * database. Repositories are mocked, so no database is needed.
 */

const repo = vi.hoisted(() => ({
  createReservation: vi.fn(),
  listBookedSlotsInRange: vi.fn(),
}));

vi.mock("@/server/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/server/repositories/reservations", async (original) => ({
  ...(await original<object>()),
  createReservation: repo.createReservation,
  listBookedSlotsInRange: repo.listBookedSlotsInRange,
}));

import { getBookedSlotCounts } from "@/server/services/reservations";

const RESTAURANT = "11111111-1111-1111-1111-111111111111";
const GULBERG = "22222222-2222-2222-2222-222222222222";
const DHA = "33333333-3333-3333-3333-333333333333";

describe("getBookedSlotCounts", () => {
  beforeEach(() => {
    repo.listBookedSlotsInRange.mockReset();
  });

  it("asks the repository once for the whole window and all locations", async () => {
    repo.listBookedSlotsInRange.mockResolvedValue([]);

    await getBookedSlotCounts(RESTAURANT, [GULBERG, DHA], "2026-09-21", "2026-10-21");

    expect(repo.listBookedSlotsInRange).toHaveBeenCalledTimes(1);
    expect(repo.listBookedSlotsInRange).toHaveBeenCalledWith(
      [GULBERG, DHA],
      "2026-09-21",
      "2026-10-21",
      expect.objectContaining({ restaurantId: RESTAURANT }),
    );
  });

  it("counts bookings per location, date and start time", async () => {
    repo.listBookedSlotsInRange.mockResolvedValue([
      { locationId: GULBERG, date: "2026-09-22", time: "19:30" },
      { locationId: GULBERG, date: "2026-09-22", time: "19:30" },
      { locationId: GULBERG, date: "2026-09-22", time: "20:00" },
      { locationId: DHA, date: "2026-09-22", time: "19:30" },
      { locationId: GULBERG, date: "2026-09-23", time: "19:30" },
    ]);

    const counts = await getBookedSlotCounts(RESTAURANT, [GULBERG, DHA], "2026-09-21", "2026-09-30");

    expect(counts).toEqual({
      [`${GULBERG}:2026-09-22`]: { "19:30": 2, "20:00": 1 },
      [`${DHA}:2026-09-22`]: { "19:30": 1 },
      [`${GULBERG}:2026-09-23`]: { "19:30": 1 },
    });
  });

  it("returns no entry for days without bookings", async () => {
    repo.listBookedSlotsInRange.mockResolvedValue([]);

    const counts = await getBookedSlotCounts(RESTAURANT, [GULBERG], "2026-09-21", "2026-09-30");

    expect(counts).toEqual({});
    expect(counts[`${GULBERG}:2026-09-25`]).toBeUndefined();
  });
});
