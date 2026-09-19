import { errors } from "../errors";
import { isOpenAt, timeToMinutes } from "../hours";
import type { Reservation } from "../contract/models";
import type { OpeningHours } from "../contract/models";
import type { ReservationStatus } from "../contract/enums";
import { paginate, type Paginated } from "../contract/api";
import { getDb, type RequestContext } from "./pool";
import { mapReservation, num, str, type Row } from "./map";
import { upsertCustomer } from "./customers";

/**
 * Reservations. Validation covers opening hours, guest limits, lead time,
 * seating capacity of the requested slot and table availability.
 */

export interface ReservationInput {
  restaurantId: string;
  locationId: string;
  guestName: string;
  guestPhone: string;
  guestEmail?: string | null;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  guests: number;
  tableNumber?: string | null;
  specialRequests?: string | null;
  occasion?: string | null;
  customerId?: string | null;
  userId?: string | null;
  autoConfirm: boolean;
  settings: {
    enabled: boolean;
    slotMinutes: number;
    minGuests: number;
    maxGuests: number;
    maxAdvanceDays: number;
    defaultDurationMinutes: number;
    tables: { name: string; seats: number }[];
  };
  timezone: string;
  hours: OpeningHours;
}

export async function createReservation(input: ReservationInput, ctx: RequestContext): Promise<Reservation> {
  const db = getDb();
  const context: RequestContext = { ...ctx, restaurantId: input.restaurantId, userId: input.userId ?? null };

  return db.write(context, async (tx) => {
    if (!input.settings.enabled) {
      throw errors.custom("RESERVATION_CLOSED", "Reservations are currently closed.");
    }
    if (input.guests < input.settings.minGuests || input.guests > input.settings.maxGuests) {
      throw errors.custom("RESERVATION_CAPACITY", `Parties of ${input.guests} cannot be booked online.`);
    }

    const reservationDate = new Date(`${input.date}T${input.time}:00`);
    if (Number.isNaN(reservationDate.getTime())) {
      throw errors.validation("Please choose a valid date and time.");
    }
    if (reservationDate.getTime() < Date.now() - 60_000) {
      throw errors.validation("Please choose a future date and time.");
    }
    const maxAdvance = Date.now() + input.settings.maxAdvanceDays * 86_400_000;
    if (reservationDate.getTime() > maxAdvance) {
      throw errors.validation(`Reservations can be made up to ${input.settings.maxAdvanceDays} days ahead.`);
    }

    if (!isOpenAt(input.hours, reservationDate, input.timezone)) {
      throw errors.custom("RESERVATION_UNAVAILABLE", "We are closed at that time. Please pick another slot.");
    }

    // Tables configured for this restaurant are the source of truth for capacity.
    if (input.settings.tables.length > 0 && input.guests > Math.max(...input.settings.tables.map((t) => t.seats))) {
      throw errors.custom("RESERVATION_CAPACITY", "That party size is larger than any of our tables.");
    }

    // Physical table inventory across the slot. Bookings inside ±slotMinutes of
    // each other compete for the same tables, so capacity is real: the assigned
    // table is persisted and therefore blocks the slot for the next party.
    const booked = await tx.query<Row>(
      `select table_number from reservations
        where location_id = $1 and reservation_date = $2::date
          and status in ('pending','confirmed','seated')
          and abs(extract(epoch from (reservation_time - $3::time))) < $4::int * 60`,
      [input.locationId, input.date, input.time, input.settings.slotMinutes],
    );
    const takenTables = new Set(booked.map((row) => str(row.table_number)).filter(Boolean));

    let tableNumber: string | null = input.tableNumber ?? null;
    if (tableNumber) {
      if (takenTables.has(tableNumber)) {
        throw errors.custom("RESERVATION_UNAVAILABLE", "That table is already booked for this slot.");
      }
    } else if (input.settings.tables.length > 0) {
      const candidate = input.settings.tables.find((table) => table.seats >= input.guests && !takenTables.has(table.name));
      if (!candidate) {
        throw errors.custom("RESERVATION_UNAVAILABLE", "That slot is fully booked. Please try another time.");
      }
      tableNumber = candidate.name;
    }

    const customer = await upsertCustomer(
      {
        restaurantId: input.restaurantId,
        fullName: input.guestName,
        phone: input.guestPhone,
        email: input.guestEmail ?? null,
        userId: input.userId ?? null,
        isGuest: !input.userId,
      },
      context,
      tx,
    );

    const row = await tx.queryOne<Row>(
      `insert into reservations
         (restaurant_id, location_id, customer_id, guest_name, guest_email, guest_phone, reservation_date,
          reservation_time, duration_minutes, guests, table_number, special_requests, occasion, status)
       values ($1,$2,$3,$4,$5,$6,$7::date,$8::time,$9,$10,$11,$12,$13,$14::reservation_status)
       returning *`,
      [
        input.restaurantId, input.locationId, customer.id, input.guestName, input.guestEmail ?? null,
        input.guestPhone, input.date, input.time, input.settings.defaultDurationMinutes, input.guests,
        tableNumber, input.specialRequests ?? null, input.occasion ?? null,
        input.autoConfirm ? "confirmed" : "pending",
      ],
    );
    if (!row) throw errors.internal("Unable to create the reservation");
    return mapReservation(row);
  });
}

export interface ReservationListFilters {
  status?: ReservationStatus | "all" | "upcoming";
  date?: string;
  from?: string;
  page?: number;
  pageSize?: number;
}

export async function listReservations(
  restaurantId: string,
  filters: ReservationListFilters,
  ctx: RequestContext,
): Promise<Paginated<Reservation>> {
  const db = getDb();
  return db.read({ ...ctx, restaurantId }, async (tx) => {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const params: unknown[] = [restaurantId];
    const conditions = ["r.restaurant_id = $1"];
    if (filters.status === "upcoming") {
      conditions.push("r.reservation_date >= current_date and r.status in ('pending','confirmed','seated')");
    } else if (filters.status && filters.status !== "all") {
      params.push(filters.status);
      conditions.push(`r.status = $${params.length}::reservation_status`);
    }
    if (filters.date) {
      params.push(filters.date);
      conditions.push(`r.reservation_date = $${params.length}::date`);
    }
    if (filters.from) {
      params.push(filters.from);
      conditions.push(`r.reservation_date >= $${params.length}::date`);
    }
    const where = conditions.join(" and ");
    const total = await tx.queryCount(`select count(*) from reservations r where ${where}`, params);
    const rows = await tx.query<Row>(
      `select r.*, l.name as location_name
         from reservations r left join restaurant_locations l on l.id = r.location_id
        where ${where}
        order by r.reservation_date asc, r.reservation_time asc
        limit ${pageSize} offset ${(page - 1) * pageSize}`,
      params,
    );
    return paginate(rows.map(mapReservation), total, page, pageSize);
  });
}

/**
 * Reservation lookup.
 * Team members and signed-in customers go through RLS as usual; guests must
 * prove ownership with the phone number on the booking (see migration 0011).
 */
export async function getReservationByCode(
  restaurantId: string,
  code: string,
  ctx: RequestContext = {},
  phone?: string | null,
): Promise<Reservation | null> {
  const db = getDb();
  const authenticated = Boolean(ctx.userId || ctx.customerId);
  if (!authenticated && !phone) return null;

  const row = authenticated
    ? await db.queryOne<Row>(
        { ...ctx, restaurantId },
        `select r.*, l.name as location_name from reservations r
           left join restaurant_locations l on l.id = r.location_id
          where r.restaurant_id = $1 and r.confirmation_code = upper($2) limit 1`,
        [restaurantId, code],
      )
    : await db.queryOne<Row>(
        { ...ctx, restaurantId },
        `select r.*, l.name as location_name from app.reservation_by_code($1, $2, $3) r
           left join restaurant_locations l on l.id = r.location_id`,
        [restaurantId, code, phone],
      );

  return row ? mapReservation(row) : null;
}

export async function updateReservationStatus(
  reservationId: string,
  status: ReservationStatus,
  ctx: RequestContext,
  notes?: string | null,
): Promise<Reservation> {
  const db = getDb();
  return db.write(ctx, async (tx) => {
    const row = await tx.queryOne<Row>(
      `update reservations set status = $2::reservation_status, notes = coalesce($3, notes) where id = $1 returning *`,
      [reservationId, status, notes ?? null],
    );
    if (!row) throw errors.notFound("Reservation");
    return mapReservation(row);
  });
}

/** Slots already booked for a date, used by the reservation form. */
export async function listBookedSlots(
  locationId: string,
  date: string,
  ctx: RequestContext = {},
): Promise<{ time: string; guests: number; status: ReservationStatus }[]> {
  const rows = await getDb().query<Row>(
    ctx,
    `select reservation_time, guests, status from reservations
      where location_id = $1 and reservation_date = $2::date and status in ('pending','confirmed','seated')
      order by reservation_time`,
    [locationId, date],
  );
  return rows.map((row) => ({
    time: str(row.reservation_time).slice(0, 5),
    guests: num(row.guests),
    status: str(row.status) as ReservationStatus,
  }));
}

export function isSlotInPast(date: string, time: string, timezone: string, now = new Date()): boolean {
  const candidate = new Date(`${date}T${time}:00`);
  void timezone;
  return candidate.getTime() < now.getTime() - 60_000;
}

export function slotToMinutes(time: string): number {
  return timeToMinutes(time);
}
