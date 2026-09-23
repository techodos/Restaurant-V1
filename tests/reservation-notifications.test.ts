import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Reservation } from "@/shared/contract/models";
import {
  renderReservationConfirmedEmail,
  renderReservationRequestedEmail,
} from "@/server/notifications/templates/reservation-emails";
import type {
  EmailMessage,
  EmailProvider,
  NotificationEventRecord,
  NotificationReservationContext,
} from "@/server/notifications/types";
import { NotificationService, type NotificationStore } from "@/server/services/notifications";
import type { EventOutcome } from "@/server/repositories/notifications";

/**
 * Reservation emails without a database: the dispatcher runs against an in-memory store and a
 * fake email provider. The one-email-per-event guarantee itself lives in SQL (unique
 * (reservation_id, event_type) + the 0017 trigger); the structure of that migration is checked here.
 */

const RESTAURANT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const RESTAURANT_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function makeContext(overrides: { restaurantId?: string; reservation?: Partial<Reservation>; emailOn?: boolean } = {}): NotificationReservationContext {
  const restaurantId = overrides.restaurantId ?? RESTAURANT_A;
  return {
    restaurant: {
      id: restaurantId,
      name: "Bella Napoli",
      slug: "bella-napoli",
      logoUrl: null,
      primaryColor: "#c2410c",
      email: "hello@bella.example",
      phone: "+92 42 111 000",
      currencySymbol: "Rs",
      locale: "en",
      timezone: "Asia/Karachi",
      reviewsEnabled: true,
      channels: { email: overrides.emailOn ?? true, push: true },
    },
    reservation: {
      id: "res-1",
      restaurantId,
      locationId: "loc-1",
      locationName: "Gulberg",
      customerId: null,
      confirmationCode: "AB12CD34",
      guestName: "Ayesha Khan",
      guestEmail: "ayesha@example.com",
      guestPhone: "+92 300 1112223",
      reservationDate: "2026-10-03",
      reservationTime: "19:30",
      durationMinutes: 90,
      guests: 4,
      tableNumber: null,
      specialRequests: "Window <table> please",
      occasion: null,
      status: "pending",
      notes: null,
      createdAt: "2026-09-22T10:00:00.000Z",
      ...overrides.reservation,
    },
  };
}

function makeEvent(eventType: string, overrides: Partial<NotificationEventRecord> = {}): NotificationEventRecord {
  return {
    id: `evt-${eventType}`,
    restaurantId: RESTAURANT_A,
    orderId: null,
    reservationId: "res-1",
    customerId: null,
    eventType,
    attempts: 1,
    emailState: null,
    pushState: null,
    ...overrides,
  };
}

function harness(options: { context?: NotificationReservationContext | null; emailResult?: Awaited<ReturnType<EmailProvider["send"]>>; email?: boolean } = {}) {
  const emails: EmailMessage[] = [];
  const saved: EventOutcome[] = [];
  const provider: EmailProvider = {
    name: "fake",
    async send(message) {
      emails.push(message);
      return options.emailResult ?? { ok: true, id: "e1" };
    },
  };
  const store: NotificationStore = {
    claimDue: async () => [],
    loadContext: async () => null,
    loadReservationContext: async () => (options.context === undefined ? makeContext() : options.context),
    activeTokens: async () => [],
    deactivateTokens: async () => undefined,
    saveOutcome: async (_event, outcome) => {
      saved.push(outcome);
    },
  };
  const service = new NotificationService({
    email: options.email === false ? null : provider,
    push: null,
    siteUrl: "https://shop.example.com",
    maxAgeHours: 24,
    store,
  });
  return { service, emails, saved };
}

describe("reservation emails", () => {
  it("'requested' tells the customer the request is pending, with the reservation details", async () => {
    const h = harness();
    expect(await h.service.processEvent(makeEvent("requested"))).toBe("done");

    expect(h.emails).toHaveLength(1);
    const mail = h.emails[0]!;
    expect(mail.to).toBe("ayesha@example.com");
    expect(mail.fromName).toBe("Bella Napoli");
    expect(mail.replyTo).toBe("hello@bella.example");
    expect(mail.idempotencyKey).toBe("reservation-res-1-requested-email");
    expect(mail.subject).toMatch(/received/i);
    for (const part of ["Pending confirmation", "AB12CD34", "19:30", "Ayesha Khan", "Bella Napoli", "Gulberg", "awaiting"]) {
      expect(mail.html).toContain(part);
    }
    expect(mail.html).toMatch(/Saturday.*October.*2026/); // 2026-10-03, formatted in the restaurant locale
    expect(mail.text).toContain("Guests: 4");
    expect(mail.text).toContain("not confirmed yet");
    expect(mail.subject).not.toMatch(/confirmed —/i);
  });

  it("'confirmed' states the reservation is confirmed", async () => {
    const h = harness({ context: makeContext({ reservation: { status: "confirmed" } }) });
    expect(await h.service.processEvent(makeEvent("confirmed"))).toBe("done");
    expect(h.emails).toHaveLength(1);
    expect(h.emails[0]!.subject).toBe("Reservation confirmed — Bella Napoli");
    expect(h.emails[0]!.idempotencyKey).toBe("reservation-res-1-confirmed-email");
    expect(h.emails[0]!.html).toContain("is confirmed");
    expect(h.emails[0]!.text).toContain("Status: Confirmed");
  });

  it("escapes customer-supplied text in the HTML", () => {
    const html = renderReservationRequestedEmail(makeContext()).html;
    expect(html).toContain("Window &lt;table&gt; please");
    expect(html).not.toContain("<table> please");
    expect(renderReservationConfirmedEmail(makeContext()).html).toContain("&lt;table&gt;");
  });

  it("does not resend a channel that already succeeded (retry after a crash)", async () => {
    const h = harness();
    await h.service.processEvent(makeEvent("confirmed", { emailState: "sent" }));
    expect(h.emails).toHaveLength(0);
    expect(h.saved[0]).toMatchObject({ status: "done", emailState: "sent" });
  });

  it("skips without an email address, without a provider, or when the restaurant switched email off", async () => {
    const noAddress = harness({ context: makeContext({ reservation: { guestEmail: null } }) });
    await noAddress.service.processEvent(makeEvent("requested"));
    expect(noAddress.emails).toHaveLength(0);
    expect(noAddress.saved[0]).toMatchObject({ status: "done", emailState: "skipped" });

    const noProvider = harness({ email: false });
    await noProvider.service.processEvent(makeEvent("requested"));
    expect(noProvider.saved[0]).toMatchObject({ status: "done", emailState: "skipped" });

    const off = harness({ context: makeContext({ emailOn: false }) });
    await off.service.processEvent(makeEvent("requested"));
    expect(off.emails).toHaveLength(0);
    expect(off.saved[0]).toMatchObject({ status: "done", emailState: "skipped" });
  });

  it("sends nothing for other statuses (cancelled reservations keep their existing behaviour)", async () => {
    const h = harness();
    await h.service.processEvent(makeEvent("cancelled"));
    expect(h.emails).toHaveLength(0);
  });

  it("retries a transient provider failure and gives up after the last attempt; the reservation is unaffected", async () => {
    const h = harness({ emailResult: { ok: false, retryable: true, error: "resend 503" } });
    expect(await h.service.processEvent(makeEvent("requested", { attempts: 1 }))).toBe("pending");
    expect(h.saved[0]!.nextAttemptAt).toBeInstanceOf(Date);
    expect(await h.service.processEvent(makeEvent("requested", { attempts: 5 }))).toBe("dead");
  });

  it("marks a permanent failure as failed without retrying", async () => {
    const h = harness({ emailResult: { ok: false, retryable: false, error: "resend 422" } });
    expect(await h.service.processEvent(makeEvent("requested"))).toBe("done");
    expect(h.saved[0]).toMatchObject({ emailState: "failed" });
  });

  it("never sends another restaurant's reservation", async () => {
    const h = harness({ context: makeContext({ restaurantId: RESTAURANT_B }) });
    expect(await h.service.processEvent(makeEvent("requested", { restaurantId: RESTAURANT_A }))).toBe("dead");
    expect(h.emails).toHaveLength(0);
  });

  it("dead-letters an event whose reservation no longer exists", async () => {
    const h = harness({ context: null });
    expect(await h.service.processEvent(makeEvent("requested"))).toBe("dead");
    expect(h.emails).toHaveLength(0);
  });
});

describe("migration 0017", () => {
  const sql = readFileSync("db/migrations/0017_reservation_notifications.sql", "utf8");

  it("reuses notification_events and makes (reservation, event) unique", () => {
    expect(sql).not.toMatch(/create table/i);
    expect(sql).toMatch(/alter column order_id drop not null/i);
    expect(sql).toMatch(/unique \(reservation_id, event_type\)/i);
    expect(sql).toMatch(/\(order_id is not null\) <> \(reservation_id is not null\)/i);
    expect(sql).toMatch(/on conflict \(reservation_id, event_type\) do nothing/i);
  });

  it("queues 'confirmed' only when the status becomes confirmed", () => {
    expect(sql).toMatch(/new\.status is distinct from old\.status and new\.status = 'confirmed'/);
    expect(sql).toMatch(/after insert or update of status on reservations/);
  });

  it("carries no begin/commit (the runner wraps the file)", () => {
    expect(sql).not.toMatch(/^\s*(begin|commit)\s*;/im);
  });
});
