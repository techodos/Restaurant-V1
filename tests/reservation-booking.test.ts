import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A table booking is ONE transaction with ONE read (restaurant settings, location hours, the customer's
 * locked row, the slot's bookings) and one insert — it used to be three transactions, ~11 round trips,
 * plus a re-render of the whole page into the response. Same rules, same precedence of errors.
 * The database is faked: it records every transaction/statement and answers by SQL shape.
 */
const { db } = vi.hoisted(() => ({
  db: {
    transactions: 0,
    statements: [] as { sql: string; params: readonly unknown[] }[],
    read: null as Record<string, unknown> | null,
    listRows: [] as unknown[],
  },
}));

vi.mock("@/server/db/registry", () => {
  const answer = (sql: string, params: readonly unknown[]) => {
    db.statements.push({ sql, params });
    if (sql.includes("row_to_json(r)")) return db.read ? [db.read] : [];
    if (sql.includes("insert into reservations")) {
      return [{
        id: "res-1", restaurant_id: params[0], location_id: params[1], customer_id: params[2], guest_name: params[3],
        guest_email: params[4], guest_phone: params[5], reservation_date: params[6], reservation_time: `${params[7]}:00`,
        duration_minutes: params[8], guests: params[9], table_number: params[10], special_requests: params[11],
        occasion: params[12], status: params[13], confirmation_code: "RSV-ABC123", created_at: new Date(),
      }];
    }
    if (sql.includes("update customers set phone")) return [{ id: params[0], restaurant_id: params[2], phone: params[1], full_name: "Noor" }];
    if (sql.includes("count(*) over ()")) return db.listRows;
    return [];
  };
  const client = {
    query: async (sql: string, params: readonly unknown[] = []) => answer(sql, params),
    queryOne: async (sql: string, params: readonly unknown[] = []) => answer(sql, params)[0] ?? null,
    queryCount: async (sql: string, params: readonly unknown[] = []) => {
      db.statements.push({ sql, params });
      return 0;
    },
  };
  const transaction = async (_ctx: unknown, handler: (tx: typeof client) => Promise<unknown>) => {
    db.transactions += 1;
    return handler(client);
  };
  return { getDb: () => ({ read: transaction, write: transaction, asService: transaction, asRuntime: transaction }) };
});

import { bookReservation, listReservations } from "@/server/repositories/reservations";
import { bookTable } from "@/server/services/reservations";

const RESTAURANT = "11111111-1111-4111-8111-111111111111";
const LOCATION = "22222222-2222-4222-8222-222222222222";
const CUSTOMER = "33333333-3333-4333-8333-333333333333";
const ALL_DAY = Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((day) => [day, [{ open: "00:00", close: "00:00" }]]));
const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);

function settings(overrides: Record<string, unknown> = {}) {
  return {
    reservations: {
      enabled: true, slotMinutes: 30, minGuests: 1, maxGuests: 8, maxAdvanceDays: 30, defaultDurationMinutes: 90,
      autoConfirm: false, tables: [{ name: "T1", seats: 2 }, { name: "T2", seats: 4 }], ...overrides,
    },
  };
}

function readRow(overrides: { restaurant?: Record<string, unknown> | null; location?: Record<string, unknown> | null; account?: Record<string, unknown> | null; booked?: unknown[] } = {}) {
  return {
    restaurant: overrides.restaurant === null ? null : {
      id: RESTAURANT, name: "Bella", slug: "bella", status: "active", timezone: "Asia/Karachi",
      features: { reservations: true }, settings: settings(), ...overrides.restaurant,
    },
    location: overrides.location === null ? null : { id: LOCATION, restaurant_id: RESTAURANT, name: "Gulberg", hours: ALL_DAY, is_active: true, ...overrides.location },
    account: overrides.account === null ? null : { id: CUSTOMER, restaurant_id: RESTAURANT, phone: "+923001234567", email: "noor@example.com", ...overrides.account },
    booked: overrides.booked ?? [],
  };
}

const input = {
  restaurantId: RESTAURANT, locationId: LOCATION, accountCustomerId: CUSTOMER, guestName: "Noor",
  guestPhone: "+923339998877", guestEmail: "typed@example.com", date: tomorrow, time: "20:00", guests: 2,
};
const ctx = { restaurantId: RESTAURANT, customerId: CUSTOMER };
const errorOf = (promise: Promise<unknown>) => promise.then(() => null, (error: { code?: string; message?: string }) => `${error.code}: ${error.message}`);

beforeEach(() => {
  db.transactions = 0;
  db.statements = [];
  db.read = readRow();
});

describe("bookReservation — one transaction, one read, one insert", () => {
  it("books in one transaction with two statements, the account's own phone and email winning", async () => {
    const reservation = await bookReservation(input, ctx);
    expect(db.transactions).toBe(1);
    expect(db.statements).toHaveLength(2);
    expect(db.statements[0]!.sql).toMatch(/for update/); // the customer's row is locked for the booking
    expect(reservation).toEqual(expect.objectContaining({
      guestPhone: "+923001234567", guestEmail: "noor@example.com", customerId: CUSTOMER, tableNumber: "T1",
      status: "pending", locationName: "Gulberg", durationMinutes: 90, confirmationCode: "RSV-ABC123",
    }));
  });

  it("stores a first mobile on an account that has none, in the same transaction (one more statement)", async () => {
    db.read = readRow({ account: { phone: "" } });
    const reservation = await bookReservation(input, ctx);
    expect(db.transactions).toBe(1);
    expect(db.statements).toHaveLength(3);
    expect(db.statements[1]!.sql).toMatch(/update customers set phone/);
    expect(db.statements[1]!.params).toEqual([CUSTOMER, "+923339998877", RESTAURANT]);
    expect(reservation.guestPhone).toBe("+923339998877");
  });

  it("auto-confirms when the restaurant says so (read fresh in the transaction)", async () => {
    db.read = readRow({ restaurant: { settings: settings({ autoConfirm: true }) } });
    expect((await bookReservation(input, ctx)).status).toBe("confirmed");
  });

  it("skips tables taken by bookings inside ±slotMinutes, and only those", async () => {
    const at = (hhmm: string) => Number(hhmm.slice(0, 2)) * 3600 + Number(hhmm.slice(3)) * 60;
    db.read = readRow({ booked: [{ table_number: "T1", seconds: at("19:45") }, { table_number: "T2", seconds: at("19:30") }] });
    // 19:30 is exactly 30 min away — outside the window, so T2 is still free; T1 (15 min away) is taken
    expect((await bookReservation(input, ctx)).tableNumber).toBe("T2");
    db.read = readRow({ booked: [{ table_number: "T1", seconds: at("20:00") }, { table_number: "T2", seconds: at("20:15") }] });
    expect(await errorOf(bookReservation(input, ctx))).toBe("RESERVATION_UNAVAILABLE: That slot is fully booked. Please try another time.");
    expect(db.statements.filter((s) => s.sql.includes("insert"))).toHaveLength(1); // the refused one wrote nothing
  });

  it("refuses with the same errors, in the same order, as before", async () => {
    db.read = readRow({ restaurant: { status: "suspended" } });
    expect(await errorOf(bookReservation(input, ctx))).toBe("NOT_FOUND: Restaurant not found.");
    db.read = readRow({ restaurant: { features: { reservations: false } } });
    expect(await errorOf(bookReservation(input, ctx))).toMatch(/^RESERVATION_CLOSED/);
    db.read = readRow({ location: { is_active: false } });
    expect(await errorOf(bookReservation(input, ctx))).toBe("VALIDATION_ERROR: Please choose one of our locations.");
    db.read = readRow({ location: null });
    expect(await errorOf(bookReservation(input, ctx))).toBe("VALIDATION_ERROR: Please choose one of our locations.");
    db.read = readRow({ account: null });
    expect(await errorOf(bookReservation(input, ctx))).toBe("SIGN_IN_REQUIRED: Please sign in again to reserve a table.");
    db.read = readRow({ restaurant: { settings: settings({ enabled: false }) } });
    expect(await errorOf(bookReservation(input, ctx))).toBe("RESERVATION_CLOSED: Reservations are currently closed.");
    db.read = readRow();
    expect(await errorOf(bookReservation({ ...input, guests: 9 }, ctx))).toBe("RESERVATION_CAPACITY: Parties of 9 cannot be booked online.");
    expect(await errorOf(bookReservation({ ...input, guests: 6 }, ctx))).toBe("RESERVATION_CAPACITY: That party size is larger than any of our tables.");
    expect(await errorOf(bookReservation({ ...input, date: "2020-01-01" }, ctx))).toBe("VALIDATION_ERROR: Please choose a future date and time.");
    db.read = readRow({ location: { hours: {} } });
    expect(await errorOf(bookReservation(input, ctx))).toMatch(/^RESERVATION_UNAVAILABLE: We are closed at that time/);
    expect(db.statements.some((s) => s.sql.includes("insert"))).toBe(false);
  });
});

describe("bookTable", () => {
  const restaurant = { id: RESTAURANT, features: { reservations: true } } as never;
  const form = { locationId: LOCATION, guestName: "Noor", guestPhone: "+923339998877", guestEmail: "", date: tomorrow, time: "20:00", guests: 2, occasion: "", specialRequests: "" };

  it("refuses a guest before touching the database", async () => {
    expect(await errorOf(bookTable(restaurant, form as never, { restaurantId: RESTAURANT, customerId: null }))).toMatch(/^SIGN_IN_REQUIRED/);
    expect(db.transactions).toBe(0);
  });

  it("a restaurant with reservations off is refused first, as before (no database)", async () => {
    const closed = { id: RESTAURANT, features: { reservations: false } } as never;
    expect(await errorOf(bookTable(closed, form as never, { restaurantId: RESTAURANT, customerId: null }))).toMatch(/^RESERVATION_CLOSED/);
    expect(db.transactions).toBe(0);
  });

  it("books for the signed-in customer through the single booking transaction", async () => {
    const reservation = await bookTable(restaurant, form as never, { restaurantId: RESTAURANT, customerId: CUSTOMER });
    expect(db.transactions).toBe(1);
    expect(reservation.customerId).toBe(CUSTOMER);
    expect(reservation.guestEmail).toBe("noor@example.com"); // the account's, not the empty form field
  });
});

describe("admin reservation list", () => {
  it("returns the page and the total from one statement", async () => {
    db.listRows = [
      { id: "res-1", restaurant_id: RESTAURANT, guest_name: "Noor", reservation_date: tomorrow, reservation_time: "20:00:00", status: "pending", guests: 2, total_count: "37" },
    ];
    const page = await listReservations(RESTAURANT, { status: "upcoming", page: 1, pageSize: 20 }, ctx);
    expect(db.statements).toHaveLength(1);
    expect(page.total).toBe(37);
    expect(page.rows[0]!.guestName).toBe("Noor");
  });
});

describe("no page re-render where nothing needs it", () => {
  it("the booking action does not revalidate (the form shows its own confirmation)", () => {
    const action = readFileSync("src/app/r/[restaurantSlug]/(site)/reservation/actions.ts", "utf8");
    expect(action).not.toMatch(/revalidatePath\(/);
    expect(action).toMatch(/after\(\(\) => dispatchDueNotifications/); // the emails still go out right after
  });

  it("'Book another' refreshes the availability instead", () => {
    const form = readFileSync("src/components/storefront/reservation-form.tsx", "utf8");
    expect(form).toMatch(/onBookAnother=\{\(\) => \{\s*setBooking\(null\);[\s\S]*?router\.refresh\(\);/);
  });

  it("the admin status control does not refresh again after its revalidating action", () => {
    const control = readFileSync("src/components/admin/reservation-status-control.tsx", "utf8");
    expect(control).not.toMatch(/router\.refresh\(\)/);
    const action = readFileSync("src/app/r/[restaurantSlug]/admin/(dashboard)/reservations/actions.ts", "utf8");
    expect(action).toMatch(/revalidatePath\(adminPath\(actor\.restaurantSlug, "\/reservations"\)\)/);
  });
});
