import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { bookReservation } from "@/server/repositories/reservations";
import { BELLA, testDatabase } from "./helpers/db";

/**
 * Table inventory under concurrency, against a real (local) Postgres: the booking transaction reads the slot's
 * bookings and picks a free table. Without the per-branch-and-day lock two guests booking the last table at the
 * same moment both got it. A throwaway restaurant (a copy of Bella with two tables, open around the clock)
 * keeps this independent of the seed's opening hours and of other test files.
 */

const restaurantId = randomUUID();
const locationId = randomUUID();
const customers: string[] = [];

beforeAll(async () => {
  await testDatabase.write({}, async (tx) => {
    await tx.query(
      `insert into restaurants
       select (jsonb_populate_record(null::restaurants, to_jsonb(r) || jsonb_build_object(
                 'id', $2::text, 'slug', $3::text,
                 'settings', jsonb_set(coalesce(r.settings, '{}'::jsonb), '{reservations}', $4::jsonb)))).*
         from restaurants r where r.id = $1`,
      [
        BELLA.restaurantId,
        restaurantId,
        `race-${restaurantId.slice(0, 8)}`,
        JSON.stringify({
          enabled: true, slotMinutes: 30, minGuests: 1, maxGuests: 12, autoConfirm: true, maxAdvanceDays: 30,
          defaultDurationMinutes: 90, tables: [{ name: "T1", seats: 4 }, { name: "T2", seats: 4 }],
        }),
      ],
    );
    const allDay = Object.fromEntries(
      ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((day) => [day, [{ open: "00:00", close: "00:00" }]]),
    );
    await tx.query(
      `insert into restaurant1s
       select (jsonb_populate_record(null::restaurant1s, to_jsonb(l) || jsonb_build_object(
                 'id', $2::text, 'restaurant_id', $3::text, 'slug', 'race-branch', 'hours', $4::jsonb))).*
         from restaurant1s l where l.id = $1`,
      [BELLA.locationGulberg, locationId, restaurantId, JSON.stringify(allDay)],
    );
    for (let i = 0; i < 6; i++) {
      const row = await tx.queryOne<{ id: string }>(
        `insert into customers (restaurant_id, full_name, email, phone, is_guest, is_email_verified)
         values ($1, $2, $3, $4, false, true) returning id`,
        [restaurantId, `Guest ${i}`, `race-${i}-${restaurantId.slice(0, 8)}@example.com`, `+9233300000${10 + i}`],
      );
      customers.push(row!.id);
    }
  });
});

afterAll(async () => {
  await testDatabase.write({}, (tx) => tx.query("delete from restaurants where id = $1", [restaurantId]));
  await testDatabase.end();
});

describe("reservations under concurrency", () => {
  it("six guests booking a two-table slot at the same moment get exactly two tables", async () => {
    const tomorrow = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    const outcomes = await Promise.allSettled(
      customers.map((customerId, i) =>
        bookReservation(
          {
            restaurantId, locationId, accountCustomerId: customerId, guestName: `Guest ${i}`,
            guestPhone: `+9233300000${10 + i}`, date: tomorrow, time: "19:00", guests: 2,
          },
          { restaurantId, customerId },
        ),
      ),
    );

    const booked = outcomes.filter((outcome) => outcome.status === "fulfilled").map((outcome) => outcome.value.tableNumber);
    const refused = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
    expect(booked.sort(), refused.map((o) => String(o.reason?.message)).join(" | ")).toEqual(["T1", "T2"]);
    for (const outcome of refused) expect(String(outcome.reason?.message), String(outcome.reason?.stack)).toMatch(/fully booked/i);

    const rows = await testDatabase.write({}, (tx) =>
      tx.query<{ table_number: string }>(
        "select table_number from reservations where location_id = $1 and reservation_date = $2::date",
        [locationId, tomorrow],
      ),
    );
    expect(rows.map((row) => row.table_number).sort()).toEqual(["T1", "T2"]);
  });
});
