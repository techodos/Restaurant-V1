import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getRestaurantById, listLocations } from "@/server/repositories/restaurants";
import { createReservation, getReservationByCode, listReservations, listBookedSlots, updateReservationStatus } from "@/server/repositories/reservations";
import { createReview, getRatingBreakdown, hasReviewedOrder, listPublicReviews, listReviews, moderateReview } from "@/server/repositories/reviews";
import { isOpenAt, minutesToTime, zonedNow } from "@/shared/hours";
import type { OpeningHours } from "@/shared/contract/models";
import type { RestaurantSettings } from "@/shared/contract/settings";

type ReservationsSettings = RestaurantSettings["reservations"];
import { type RequestContext } from "@/server/context";
import { ANON, BELLA, OWNER, SAKURA, SAKURA_OWNER, testDatabase } from "./helpers/db";

const ANON_CTX = ANON;
const ownerCtx = OWNER;
const restaurantId = BELLA.restaurantId;

let settings: ReservationsSettings;
let hours: OpeningHours;
let timezone: string;
let staff: RequestContext;

/**
 * A future date/time in the restaurant's timezone that the opening-hours
 * configuration considers open — derived from the database, never hardcoded.
 */
function nextOpenSlot(extraDays = 1): { date: string; time: string } {
  for (let dayOffset = extraDays; dayOffset < extraDays + 8; dayOffset += 1) {
    const day = zonedNow(new Date(Date.now() + dayOffset * 86_400_000), timezone);
    for (let minutes = 12 * 60; minutes <= 22 * 60; minutes += settings.slotMinutes) {
      const time = minutesToTime(minutes);
      const probe = new Date(`${day.dateKey}T${time}:00Z`);
      if (isOpenAt(hours, probe, timezone)) return { date: day.dateKey, time };
    }
  }
  throw new Error("no open slot found");
}

beforeAll(async () => {
  const restaurant = await getRestaurantById(restaurantId, ANON_CTX);
  if (!restaurant) throw new Error("seed missing — run npm run db:seed");
  const locations = await listLocations(restaurantId, ANON_CTX);
  const primary = locations.find((location) => location.id === BELLA.locationGulberg) ?? locations[0];
  if (!primary) throw new Error("seed missing a location");
  settings = restaurant.settings.reservations;
  hours = primary.hours;
  timezone = restaurant.timezone;
  staff = { userId: BELLA.userOwner, restaurantId, actor: "Imran Chaudhry" };
});

const createdReservations: string[] = [];
const createdReviews: string[] = [];

afterAll(async () => {
  // the test database is long-lived, so remove what this run created
  await testDatabase.write({ restaurantId }, async (db) => {
    if (createdReservations.length) {
      await db.query("delete from reservations where id = any($1::uuid[])", [createdReservations]);
    }
    if (createdReviews.length) {
      await db.query("delete from reviews where id = any($1::uuid[])", [createdReviews]);
    }
  });
  await testDatabase.end();
});

describe("reservations", () => {
  it("books a table for a guest and stores the confirmation code", async () => {
    const { date, time } = nextOpenSlot();
    const reservation = await createReservation(
      {
        restaurantId,
        locationId: BELLA.locationGulberg,
        guestName: "Ayesha Khan",
        guestPhone: "+92 300 5550001",
        guestEmail: "ayesha@example.com",
        date,
        time,
        guests: 4,
        specialRequests: "Window table if possible",
        autoConfirm: settings.autoConfirm,
        settings,
        timezone,
        hours,
      },
      ANON_CTX,
    );

    createdReservations.push(reservation.id);
    expect(reservation.confirmationCode).toMatch(/^[A-Z0-9]{6,}$/);
    expect(reservation.status).toBe(settings.autoConfirm ? "confirmed" : "pending");
    expect(reservation.guests).toBe(4);

    // a guest can look the booking up with code + phone, and only then
    expect(await getReservationByCode(restaurantId, reservation.confirmationCode, ANON_CTX)).toBeNull();
    expect(
      await getReservationByCode(restaurantId, reservation.confirmationCode, ANON_CTX, "+92 300 9999999"),
    ).toBeNull();
    const fetched = await getReservationByCode(restaurantId, reservation.confirmationCode, ANON_CTX, "+92 300 5550001");
    expect(fetched?.id).toBe(reservation.id);
    expect(fetched?.guestName).toBe("Ayesha Khan");

    const upcoming = await listReservations(restaurantId, { status: "upcoming" }, staff);
    expect(upcoming.rows.some((row) => row.id === reservation.id)).toBe(true);
  });

  it("rejects guest counts outside the configured range", async () => {
    const { date, time } = nextOpenSlot();
    const base = {
      restaurantId,
      locationId: BELLA.locationGulberg,
      guestName: "Too Many",
      guestPhone: "+92 300 5550002",
      date,
      time,
      autoConfirm: false,
      settings,
      timezone,
      hours,
    };
    await expect(createReservation({ ...base, guests: settings.maxGuests + 1 }, ANON_CTX)).rejects.toThrowError(/parties of|cannot be booked/i);
    await expect(createReservation({ ...base, guests: 0 }, ANON_CTX)).rejects.toThrowError(/parties of|cannot be booked/i);
  });

  it("rejects closed hours, past dates and dates beyond the booking window", async () => {
    const { date, time } = nextOpenSlot();
    const base = {
      restaurantId,
      locationId: BELLA.locationGulberg,
      guestName: "Off Grid",
      guestPhone: "+92 300 5550003",
      guests: 2,
      autoConfirm: false,
      settings,
      timezone,
      hours,
    };

    // 03:00 is outside every configured opening window
    await expect(createReservation({ ...base, date, time: "03:00" }, ANON_CTX)).rejects.toThrowError(/closed|another slot/i);

    const yesterday = zonedNow(new Date(Date.now() - 2 * 86_400_000), timezone).dateKey;
    await expect(createReservation({ ...base, date: yesterday, time }, ANON_CTX)).rejects.toThrowError(/future/i);

    const tooFar = nextOpenSlot(settings.maxAdvanceDays + 3);
    await expect(createReservation({ ...base, date: tooFar.date, time: tooFar.time }, ANON_CTX)).rejects.toThrowError(/advance|days|ahead/i);
  });

  it("refuses bookings while reservations are switched off", async () => {
    const { date, time } = nextOpenSlot();
    await expect(
      createReservation(
        {
          restaurantId,
          locationId: BELLA.locationGulberg,
          guestName: "Closed",
          guestPhone: "+92 300 5550004",
          date,
          time,
          guests: 2,
          autoConfirm: false,
          settings: { ...settings, enabled: false },
          timezone,
          hours,
        },
        ANON_CTX,
      ),
    ).rejects.toThrowError(/closed/i);
  });

  it("stops taking bookings once the table inventory for a slot is exhausted", async () => {
    // one 4-seat table: a party of 4 fills it, so the next party is refused
    const oneTable: ReservationsSettings = { ...settings, tables: [{ name: "Lone Table", seats: 4 }] };
    // far enough ahead that no earlier test run's bookings interfere
    let date = "";
    let time = "";
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const slot = nextOpenSlot(settings.maxAdvanceDays - 2 - attempt);
      const alreadyBooked = await listBookedSlots(BELLA.locationGulberg, slot.date, staff);
      if (!alreadyBooked.some((row) => row.time === slot.time)) {
        date = slot.date;
        time = slot.time;
        break;
      }
      if (attempt === 9) throw new Error("no free slot available for the capacity test");
    }

    const makeBooking = (name: string, phone: string) =>
      createReservation(
        {
          restaurantId,
          locationId: BELLA.locationGulberg,
          guestName: name,
          guestPhone: phone,
          date,
          time,
          guests: 4,
          autoConfirm: true,
          settings: oneTable,
          timezone,
          hours,
        },
        ANON_CTX,
      );

    const first = await makeBooking("Slot One", "+92 300 5550005");
    createdReservations.push(first.id);
    expect(first.status).toBe("confirmed");

    const booked = await listBookedSlots(BELLA.locationGulberg, date, staff);
    expect(booked.some((slot) => slot.time === time)).toBe(true);

    await expect(makeBooking("Slot Two", "+92 300 5550006")).rejects.toThrowError(/fully booked/i);
  });

  it("lets staff move a reservation through its lifecycle", async () => {
    const { date, time } = nextOpenSlot(2);
    const reservation = await createReservation(
      {
        restaurantId,
        locationId: BELLA.locationGulberg,
        guestName: "Lifecycle Guest",
        guestPhone: "+92 300 5550007",
        date,
        time,
        guests: 3,
        autoConfirm: false,
        settings,
        timezone,
        hours,
      },
      ANON_CTX,
    );
    createdReservations.push(reservation.id);
    expect(reservation.status).toBe("pending");

    const confirmed = await updateReservationStatus(reservation.id, "confirmed", staff);
    expect(confirmed.status).toBe("confirmed");
    const seated = await updateReservationStatus(reservation.id, "seated", staff);
    expect(seated.status).toBe("seated");
    const completed = await updateReservationStatus(reservation.id, "completed", staff);
    expect(completed.status).toBe("completed");

    const cancelled = await updateReservationStatus(reservation.id, "cancelled", staff, "Guest called to cancel");
    expect(cancelled.status).toBe("cancelled");

    // no-shows are only bookkeeping for staff, and guests cannot see other tenants
    const otherTenant = await getReservationByCode(SAKURA.restaurantId, reservation.confirmationCode, SAKURA_OWNER);
    expect(otherTenant).toBeNull();
  });
});

describe("reviews and moderation", () => {
  it("hides a new review until it is approved", async () => {
    const before = await listPublicReviews(restaurantId, { limit: 50 }, ANON_CTX);
    const review = await createReview(
      {
        restaurantId,
        authorName: "Pending Patron",
        authorEmail: "pending@example.com",
        rating: 5,
        title: "Lovely evening",
        comment: "The truffle pizza was excellent and the staff were attentive.",
        status: settings.enabled ? "pending" : "approved",
      },
      ANON_CTX,
    );
    createdReviews.push(review.id);

    const duringModeration = await listPublicReviews(restaurantId, { limit: 50 }, ANON_CTX);
    expect(duringModeration.some((row) => row.id === review.id)).toBe(false);

    const approved = await moderateReview(review.id, { status: "approved" }, ownerCtx);
    expect(approved.status).toBe("approved");

    const afterApproval = await listPublicReviews(restaurantId, { limit: 50 }, ANON_CTX);
    expect(afterApproval.some((row) => row.id === review.id)).toBe(true);
    expect(afterApproval.length).toBeGreaterThanOrEqual(before.length);

    // staff see the moderation queue regardless of status
    const queue = await listReviews(restaurantId, { status: "approved" }, ownerCtx);
    expect(queue.rows.some((row) => row.id === review.id)).toBe(true);
  });

  it("computes the rating breakdown from approved reviews only", async () => {
    const breakdown = await getRatingBreakdown(restaurantId);
    expect(breakdown.count).toBeGreaterThan(0);
    expect(breakdown.average).toBeGreaterThan(0);
    expect(breakdown.average).toBeLessThanOrEqual(5);
    const sum = Object.values(breakdown.distribution).reduce((total, count) => total + count, 0);
    expect(sum).toBe(breakdown.count);
  });

  it("keeps rejected reviews out of the storefront and out of the average", async () => {
    const review = await createReview(
      {
        restaurantId,
        authorName: "Rejected Reviewer",
        rating: 1,
        comment: "Nothing was wrong, just testing moderation.",
        status: "pending",
      },
      ANON_CTX,
    );
    createdReviews.push(review.id);
    const breakdownBefore = await getRatingBreakdown(restaurantId);
    await moderateReview(review.id, { status: "rejected" }, ownerCtx);
    const breakdownAfter = await getRatingBreakdown(restaurantId);

    const publicReviews = await listPublicReviews(restaurantId, { limit: 50 }, ANON_CTX);
    expect(publicReviews.some((row) => row.id === review.id)).toBe(false);
    expect(breakdownAfter.count).toBe(breakdownBefore.count);
  });

  it("lets staff reply to a review and feature it", async () => {
    const queue = await listReviews(restaurantId, { status: "approved" }, ownerCtx);
    const review = queue.rows[0];
    if (!review) throw new Error("expected seeded reviews");
    const updated = await moderateReview(
      review.id,
      { response: "Thank you for the kind words — see you soon!", isFeatured: true },
      ownerCtx,
    );
    expect(updated.response).toContain("Thank you");
    expect(updated.isFeatured).toBe(true);
  });

  it("only lets the ordering guest review an order once", async () => {
    const order = await testDatabase.read(ownerCtx, (db) =>
      db.queryOne<{ id: string; customer_name: string; menu_item_id: string | null }>(
        `select o.id, o.customer_name, (select oi.menu_item_id from order_items oi where oi.order_id = o.id limit 1) as menu_item_id
           from orders o
          where o.restaurant_id = $1 and not exists (select 1 from reviews r where r.order_id = o.id)
          limit 1`,
        [restaurantId],
      ),
    );
    if (!order) throw new Error("expected an unreviewed seeded order");

    expect(await hasReviewedOrder(order.id, ownerCtx)).toBe(false);
    const review = await createReview(
      {
        restaurantId,
        orderId: order.id,
        menuItemId: order.menu_item_id,
        authorName: order.customer_name,
        rating: 4,
        comment: "Solid food, quick delivery.",
        status: "pending",
      },
      ownerCtx,
    );
    createdReviews.push(review.id);
    expect(await hasReviewedOrder(order.id, ownerCtx)).toBe(true);

    await expect(
      createReview(
        {
          restaurantId,
          orderId: order.id,
          authorName: order.customer_name,
          rating: 2,
          status: "pending",
        },
        ownerCtx,
      ),
    ).rejects.toThrow();

    await moderateReview(review.id, { status: "approved" }, ownerCtx);
  });
});
