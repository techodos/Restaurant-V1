import { errors } from "@/server/errors";
import { isOpenAt, timeToMinutes, zonedDateTime } from "@/shared/hours";
import type { Reservation } from "@/shared/contract/models";
import type { OpeningHours } from "@/shared/contract/models";
import type { ReservationStatus } from "@/shared/contract/enums";
import { paginate, type Paginated } from "@/shared/contract/api";
import { getDb } from "@/server/db/registry";
import { type RequestContext } from "@/server/context";
import { branchFilter, mapLocation, mapReservation, mapRestaurant, num, str, type Row } from "@/server/db/mappers";
import { type DbClient } from "@/server/db/database";
import { attachAccountCustomer, saveFirstAccountPhone, upsertCustomer } from "./customers";

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
  /** the signed-in visitor's own customer id, if any — resolved by id, never re-derived from the typed phone */
  accountCustomerId?: string | null;
  /** save the typed phone onto the account only when it has none yet (mirrors checkout's placeOrder) */
  saveAccountPhone?: boolean;
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
  const db = getDb({ restaurantId: input.restaurantId });
  // A customer is identified by customer_id only; the session's app.current_user_id (auth.users, staff) stays
  // unset (same reason as createOrder). input.userId still decides below whether the customer row is a guest.
  const context: RequestContext = { ...ctx, restaurantId: input.restaurantId, userId: null };

  return db.write(context, async (tx) => {
    assertBookable(input);
    await lockBookingDay(tx, input.locationId, input.date);

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
    const tableNumber = pickTable(input.settings, input.guests, takenTables, input.tableNumber ?? null);

    // A signed-in visitor already has their own customer row (keyed by their account email); resolve it
    // by id, never by the phone typed into this form — `customers` has an independent unique key on
    // (restaurant_id, lower(email)) as well as on phone, so upserting-by-phone for an already-known
    // account risks inserting a second row that collides with the account's own email (see
    // `attachAccountCustomer`'s doc comment for the incident this fixes).
    const customer = input.accountCustomerId
      ? await attachAccountCustomer(input.restaurantId, input.accountCustomerId, input.saveAccountPhone ? input.guestPhone : null, context, tx)
      : await upsertCustomer(
          {
            restaurantId: input.restaurantId,
            fullName: input.guestName,
            phone: input.guestPhone,
            email: input.guestEmail ?? null,
            isGuest: !input.userId,
          },
          context,
          tx,
        );

    return insertReservation(tx, {
      restaurantId: input.restaurantId,
      locationId: input.locationId,
      customerId: customer.id,
      guestName: input.guestName,
      guestEmail: input.guestEmail ?? null,
      guestPhone: input.guestPhone,
      date: input.date,
      time: input.time,
      durationMinutes: input.settings.defaultDurationMinutes,
      guests: input.guests,
      tableNumber,
      specialRequests: input.specialRequests ?? null,
      occasion: input.occasion ?? null,
      status: input.autoConfirm ? "confirmed" : "pending",
    });
  });
}

type BookingRules = Pick<ReservationInput, "settings" | "guests" | "date" | "time" | "hours" | "timezone">;

/**
 * Every rule a booking request must pass before the table inventory is looked at, in the order the
 * customer should hear about them: reservations enabled, party size, a valid future date inside the
 * advance window, open at that time, and a table big enough for the party. Pure — shared by
 * `createReservation` and `bookReservation` so both decide exactly alike.
 */
function assertBookable(input: BookingRules): void {
  if (!input.settings.enabled) {
    throw errors.custom("RESERVATION_CLOSED", "Reservations are currently closed.");
  }
  if (input.guests < input.settings.minGuests || input.guests > input.settings.maxGuests) {
    throw errors.custom("RESERVATION_CAPACITY", `Parties of ${input.guests} cannot be booked online.`);
  }

  // the restaurant's wall clock, not the server's (UTC on most hosts)
  const reservationDate = zonedDateTime(input.date, input.time, input.timezone);
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
}

/** The table this party gets: the one asked for if free, else the first free table that seats them. */
/**
 * Bookings for one branch and day, one at a time. The table check is "read the slot's bookings, pick a free
 * table, insert" — without this, two guests booking the last table at the same moment both saw it free and
 * both got it. The lock is held until this transaction ends, and it is its own statement BEFORE the read
 * (a READ COMMITTED read takes its snapshot when it starts, so it then sees the booking that just committed).
 * Other branches and days are unaffected. One extra round trip per booking.
 */
async function lockBookingDay(tx: DbClient, locationId: string, date: string): Promise<void> {
  await tx.query("select pg_advisory_xact_lock(hashtextextended('reservation:' || $1::text || ':' || $2::text, 0))", [locationId, date]);
}

function pickTable(
  settings: ReservationInput["settings"],
  guests: number,
  takenTables: ReadonlySet<string>,
  requested: string | null,
): string | null {
  if (requested) {
    if (takenTables.has(requested)) {
      throw errors.custom("RESERVATION_UNAVAILABLE", "That table is already booked for this slot.");
    }
    return requested;
  }
  if (settings.tables.length === 0) return null;
  const candidate = settings.tables.find((table) => table.seats >= guests && !takenTables.has(table.name));
  if (!candidate) {
    throw errors.custom("RESERVATION_UNAVAILABLE", "That slot is fully booked. Please try another time.");
  }
  return candidate.name;
}

async function insertReservation(
  tx: DbClient,
  values: {
    restaurantId: string;
    locationId: string;
    customerId: string;
    guestName: string;
    guestEmail: string | null;
    guestPhone: string;
    date: string;
    time: string;
    durationMinutes: number;
    guests: number;
    tableNumber: string | null;
    specialRequests: string | null;
    occasion: string | null;
    status: "confirmed" | "pending";
  },
): Promise<Reservation> {
  const row = await tx.queryOne<Row>(
    `insert into reservations
       (restaurant_id, location_id, customer_id, guest_name, guest_email, guest_phone, reservation_date,
        reservation_time, duration_minutes, guests, table_number, special_requests, occasion, status)
     values ($1,$2,$3,$4,$5,$6,$7::date,$8::time,$9,$10,$11,$12,$13,$14::reservation_status)
     returning *`,
    [
      values.restaurantId, values.locationId, values.customerId, values.guestName, values.guestEmail,
      values.guestPhone, values.date, values.time, values.durationMinutes, values.guests,
      values.tableNumber, values.specialRequests, values.occasion, values.status,
    ],
  );
  if (!row) throw errors.internal("Unable to create the reservation");
  return mapReservation(row);
}

export interface BookReservationInput {
  restaurantId: string;
  locationId: string;
  /** the signed-in customer making the booking (required: bookings are for signed-in customers) */
  accountCustomerId: string;
  guestName: string;
  /** what the form sent; the account's own saved mobile/email win when it has them */
  guestPhone: string;
  guestEmail?: string | null;
  date: string;
  time: string;
  guests: number;
  specialRequests?: string | null;
  occasion?: string | null;
}

/**
 * A signed-in customer's table booking in ONE transaction with ONE read: the restaurant's reservation
 * settings and time zone, the location's hours, the customer's own row (locked) and the slot's bookings
 * — all as they are NOW (never the storefront snapshot) — then the same rules as `createReservation`
 * (`assertBookable`, `pickTable`) and one insert. The booking used to cost three transactions (the
 * restaurant, then the account, then the booking itself with three more statements), ~11 round trips.
 * The account's saved mobile/email win over the form's (same precedence as checkout); a first mobile is
 * stored on the account in this transaction, so only when the booking commits.
 */
export async function bookReservation(input: BookReservationInput, ctx: RequestContext): Promise<Reservation> {
  // A customer is identified by customer_id only; app.current_user_id (auth.users, staff) stays unset
  // (same reason as createOrder: the status-history trigger's changed_by is a staff FK).
  const context: RequestContext = { ...ctx, restaurantId: input.restaurantId, customerId: input.accountCustomerId, userId: null };
  return getDb({ restaurantId: input.restaurantId }).write(context, async (tx) => {
    await lockBookingDay(tx, input.locationId, input.date);
    const read = await tx.queryOne<Row>(
      `select
         (select row_to_json(r) from (select id, name, slug, status, timezone, features, entitlements, settings
                                        from restaurants where id = $1) r) as restaurant,
         (select row_to_json(l) from (select id, restaurant_id, name, hours, is_active
                                        from restaurant1s where id = $2 and restaurant_id = $1) l) as location,
         (select row_to_json(c) from (select id, restaurant_id, phone, email
                                        from customers where id = $3 and restaurant_id = $1 for update) c) as account,
         (select coalesce(json_agg(json_build_object('table_number', table_number,
                                                     'seconds', extract(epoch from reservation_time))), '[]'::json)
            from reservations
           where location_id = $2 and reservation_date = $4::date
             and status in ('pending','confirmed','seated')) as booked`,
      [input.restaurantId, input.locationId, input.accountCustomerId, input.date],
    );

    const restaurant = read?.restaurant ? mapRestaurant(read.restaurant as Row) : null;
    // this read is privileged, so it also sees restaurants the storefront role cannot (RLS
    // `restaurants_read`: active, or a team member) — refuse those exactly as that read did
    if (!restaurant || restaurant.status !== "active") throw errors.notFound("Restaurant");
    if (!restaurant.features.reservations) {
      throw errors.custom("RESERVATION_CLOSED", "This restaurant is not taking reservations online.");
    }
    const locationRow = read?.location as Row | null | undefined;
    if (!locationRow || !locationRow.is_active) throw errors.validation("Please choose one of our locations.");
    const location = mapLocation(locationRow);
    const account = read?.account as Row | null | undefined;
    if (!account) throw errors.custom("SIGN_IN_REQUIRED", "Please sign in again to reserve a table.");

    const settings = restaurant.settings.reservations;
    assertBookable({ settings, guests: input.guests, date: input.date, time: input.time, hours: location.hours, timezone: restaurant.timezone });

    // the slot's competing bookings: inside ±slotMinutes of the requested time (as createReservation's query)
    const requested = timeToMinutes(input.time) * 60;
    const takenTables = new Set(
      ((read?.booked as Row[] | null) ?? [])
        .filter((row) => Math.abs(num(row.seconds) - requested) < settings.slotMinutes * 60)
        .map((row) => str(row.table_number))
        .filter(Boolean),
    );
    const tableNumber = pickTable(settings, input.guests, takenTables, null);

    const savedPhone = str(account.phone).trim() ? str(account.phone) : null;
    const phone = savedPhone ?? input.guestPhone;
    const email = str(account.email) || input.guestEmail || null;
    if (!savedPhone) await saveFirstAccountPhone(tx, input.restaurantId, input.accountCustomerId, phone);

    const reservation = await insertReservation(tx, {
      restaurantId: input.restaurantId,
      locationId: location.id,
      customerId: input.accountCustomerId,
      guestName: input.guestName,
      guestEmail: email,
      guestPhone: phone,
      date: input.date,
      time: input.time,
      durationMinutes: settings.defaultDurationMinutes,
      guests: input.guests,
      tableNumber,
      specialRequests: input.specialRequests ?? null,
      occasion: input.occasion ?? null,
      status: settings.autoConfirm ? "confirmed" : "pending",
    });
    return { ...reservation, locationName: location.name };
  });
}

export interface ReservationListFilters {
  status?: ReservationStatus | "all" | "upcoming";
  date?: string;
  from?: string;
  locationId?: string;
  page?: number;
  pageSize?: number;
}

export async function listReservations(
  restaurantId: string,
  filters: ReservationListFilters,
  ctx: RequestContext,
): Promise<Paginated<Reservation>> {
  const db = getDb({ restaurantId });
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
    if (filters.locationId) {
      params.push(filters.locationId);
      conditions.push(branchFilter("r", `$${params.length}`));
    }
    const where = conditions.join(" and ");
    // the page and the total in ONE statement (`count(*) over ()` counts every match before LIMIT);
    // only a page past the end (no rows to carry the total) needs the separate count
    const rows = await tx.query<Row>(
      `select r.*, l.name as location_name, count(*) over () as total_count
         from reservations r left join restaurant1s l on l.id = r.location_id
        where ${where}
        order by r.reservation_date asc, r.reservation_time asc
        limit ${pageSize} offset ${(page - 1) * pageSize}`,
      params,
    );
    const total =
      rows.length > 0
        ? num(rows[0]!.total_count)
        : page > 1
          ? await tx.queryCount(`select count(*) from reservations r where ${where}`, params)
          : 0;
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
  const db = getDb({ restaurantId });
  const authenticated = Boolean(ctx.userId || ctx.customerId);
  if (!authenticated && !phone) return null;

  const row = authenticated
    ? await db.queryOne<Row>(
        { ...ctx, restaurantId },
        `select r.*, l.name as location_name from reservations r
           left join restaurant1s l on l.id = r.location_id
          where r.restaurant_id = $1 and r.confirmation_code = upper($2) limit 1`,
        [restaurantId, code],
      )
    : await db.queryOne<Row>(
        { ...ctx, restaurantId },
        `select r.*, l.name as location_name from app.reservation_by_code($1, $2, $3) r
           left join restaurant1s l on l.id = r.location_id`,
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
  const db = getDb(ctx);
  return db.write(ctx, async (tx) => {
    const row = await tx.queryOne<Row>(
      // app_service (no RLS): restaurant + branch scope in the statement, as in orders#updateOrderStatus
      `update reservations set status = $2::reservation_status, notes = coalesce($3, notes)
        where id = $1
          and restaurant_id = coalesce(app.current_restaurant_id(), restaurant_id)
          and app.can_access_location(restaurant_id, location_id)
        returning *`,
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
  const rows = await getDb(ctx).query<Row>(
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

/**
 * Slots already booked at several locations over a date window (inclusive), in
 * one query. The booking page needs the whole window at once; asking per day and
 * location costs a database transaction each.
 */
export async function listBookedSlotsInRange(
  locationIds: readonly string[],
  fromDate: string,
  toDate: string,
  ctx: RequestContext = {},
): Promise<{ locationId: string; date: string; time: string }[]> {
  if (locationIds.length === 0) return [];
  const rows = await getDb(ctx).query<Row>(
    ctx,
    `select location_id, to_char(reservation_date, 'YYYY-MM-DD') as reservation_date, reservation_time
       from reservations
      where location_id = any($1::uuid[])
        and reservation_date between $2::date and $3::date
        and status in ('pending','confirmed','seated')`,
    [locationIds, fromDate, toDate],
  );
  return rows.map((row) => ({
    locationId: str(row.location_id),
    date: str(row.reservation_date),
    time: str(row.reservation_time).slice(0, 5),
  }));
}

export function isSlotInPast(date: string, time: string, timezone: string, now = new Date()): boolean {
  return zonedDateTime(date, time, timezone).getTime() < now.getTime() - 60_000;
}

export function slotToMinutes(time: string): number {
  return timeToMinutes(time);
}
