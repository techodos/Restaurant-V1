import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BELLA, BELLA_OPEN_NOW, CHEF, MANAGER, OWNER, testDatabase } from "./helpers/db";
import {
  applyPosOp,
  closeShift,
  findDevice,
  getZReport,
  issueCreditNote,
  listDevices,
  openShift,
  registerDevice,
  type PosActor,
} from "@/server/repositories/pos";
import { getOrderById } from "@/server/repositories/orders";
import { drainFiscalQueue, submitFiscalNow } from "@/server/services/fiscal";
import { MockFiscalAdapter, setFiscalAdapterForTests } from "@/server/integrations/fiscal";
import type { PosOp, PosTicketInput } from "@/shared/pos";

/**
 * The in-store POS against a real Postgres (SKILL.md §43): a counter sale is an ordinary order the kitchen sees, every
 * queued till op is applied at most once, invoices are immutable and numbered per till, fiscal sends retry, and the
 * day cannot close while an invoice is unreported. Needs the disposable test database (SKILL.md §28).
 */

const owner: PosActor = { restaurantId: BELLA.restaurantId, memberId: BELLA.memberOwner, userId: BELLA.userOwner, name: "Imran Chaudhry" };
const now = BELLA_OPEN_NOW;
let espresso: string;
let garlicBread: string;
let deviceId: string;
let dhaDeviceId: string;
let shiftId: string;
let originalSettings: unknown;
let seq = 0;

function ticket(overrides: Partial<PosTicketInput> = {}): PosTicketInput {
  return {
    clientOrderId: randomUUID(),
    orderType: "dine_in",
    tableNumber: "4",
    guests: 2,
    lines: [{ clientLineId: randomUUID(), menuItemId: espresso, variantId: null, quantity: 2, addons: [] }],
    ...overrides,
  };
}

function sale(t: PosTicketInput, tender: "cash" | "card", total: string, extra: { tendered?: string; seq?: number } = {}): PosOp {
  return {
    id: randomUUID(),
    kind: "sale",
    shiftId,
    ticket: t,
    sale: {
      clientOrderId: t.clientOrderId,
      invoiceSeq: extra.seq ?? ++seq,
      issuedAt: new Date().toISOString(),
      expectedTotal: total,
      tenders: [{ clientPaymentId: randomUUID(), tender, amount: total, tendered: extra.tendered ?? null }],
    },
  };
}

beforeAll(async () => {
  const items = await testDatabase.read(OWNER, (db) =>
    db.query<{ id: string; name: string }>(
      `select id, name from menu_items where restaurant_id = $1 and name in ('Espresso Doppio', 'Garlic Bread Napoli')`,
      [BELLA.restaurantId],
    ),
  );
  espresso = items.find((item) => item.name === "Espresso Doppio")!.id;
  garlicBread = items.find((item) => item.name === "Garlic Bread Napoli")!.id;
  // known tax: cash 16 %, card 8 %, no service fee
  originalSettings = (await testDatabase.write(OWNER, (db) =>
    db.queryOne<{ settings: unknown }>(
      `with old as (select settings from restaurants where id = $1)
       update restaurants set settings = jsonb_set(jsonb_set(settings, '{tax}', $2::jsonb), '{serviceFee}', '{}'::jsonb)
        where id = $1 returning (select settings from old)`,
      [BELLA.restaurantId, JSON.stringify({ enabled: true, rate: 0, included: false, label: "Sales tax", byPaymentMethod: { card: { rate: 8 }, cashOnDelivery: { rate: 16 } } })],
    ),
  ))!.settings;
  const suffix = Math.random().toString(36).slice(2, 5).toUpperCase();
  deviceId = (await registerDevice({ locationId: BELLA.locationGulberg, name: "Counter 1", code: `G${suffix}` }, owner, OWNER)).id;
  dhaDeviceId = (await registerDevice({ locationId: BELLA.locationDha, name: "DHA counter", code: `D${suffix}` }, owner, OWNER)).id;
  shiftId = (await openShift({ deviceId, openingFloat: "5000.00", businessDate: "2026-11-07" }, owner, OWNER)).id;
  setFiscalAdapterForTests(new MockFiscalAdapter());
});

afterAll(async () => {
  setFiscalAdapterForTests(null);
  await testDatabase.write(OWNER, (db) => db.query(`update restaurants set settings = $2::jsonb where id = $1`, [BELLA.restaurantId, JSON.stringify(originalSettings)]));
  await testDatabase.end();
});

describe("tills and shifts", () => {
  it("allows one open shift per till", async () => {
    await expect(openShift({ deviceId, openingFloat: "0", businessDate: "2026-11-07" }, owner, OWNER)).rejects.toThrow(/already has an open shift/);
  });

  it("shows a branch manager only their own branch's tills (RLS), and staff without pos.use none", async () => {
    expect(await findDevice(BELLA.restaurantId, deviceId, MANAGER)).not.toBeNull();
    expect(await findDevice(BELLA.restaurantId, dhaDeviceId, MANAGER)).toBeNull();
    expect((await listDevices(BELLA.restaurantId, OWNER)).map((device) => device.id)).toEqual(expect.arrayContaining([deviceId, dhaDeviceId]));
    expect(await listDevices(BELLA.restaurantId, CHEF)).toEqual([]);
  });
});

describe("tickets and sales", () => {
  it("sends a ticket to the kitchen as an ordinary confirmed order, once, and adds later lines only", async () => {
    const t = ticket();
    const op: PosOp = { id: randomUUID(), kind: "ticket", shiftId, ticket: t };
    const first = await applyPosOp(op, owner, OWNER, now);
    expect(first.ok).toBe(true);
    const replay = await applyPosOp(op, owner, OWNER, now);
    expect(replay.orderId).toBe(first.orderId);

    // what the kitchen board reads (an active status, the branch, its lines). Not its list itself: that is capped at
    // the 60 oldest active tickets, which the other suites' fixture orders already fill in the shared test database.
    const order = await getOrderById(first.orderId!, OWNER);
    expect(order).toMatchObject({ status: "confirmed", source: "pos", locationId: BELLA.locationGulberg, orderType: "dine_in", tableNumber: "4" });
    expect(order?.items).toHaveLength(1);

    const more = { ...t, lines: [...t.lines, { clientLineId: randomUUID(), menuItemId: garlicBread, variantId: null, quantity: 1, addons: [] }] };
    await applyPosOp({ id: randomUUID(), kind: "ticket", shiftId, ticket: more }, owner, OWNER, now);
    await applyPosOp({ id: randomUUID(), kind: "ticket", shiftId, ticket: more }, owner, OWNER, now);
    const row = await testDatabase.read(OWNER, (db) =>
      db.queryOne<{ lines: number; subtotal: string; source: string; placed_by: string }>(
        `select (select count(*) from order_items where order_id = o.id)::int as lines, subtotal::text, source, placed_by from orders o where id = $1`,
        [first.orderId],
      ),
    );
    expect(row).toEqual({ lines: 2, subtotal: "1030.00", source: "pos", placed_by: "staff" });
  });

  it("records a cash sale at the cash rate with change, issues a pending invoice, and replays it unchanged", async () => {
    const t = ticket();
    const op = sale(t, "cash", "742.40", { tendered: "1000.00" }); // 640 + 16 %
    const result = await applyPosOp(op, owner, OWNER, now);
    expect(result).toMatchObject({ ok: true, totalMismatch: null });
    expect(result.invoiceNumber).toMatch(/^G[A-Z0-9]{3}-0000\d\d$/);

    const replay = await applyPosOp(op, owner, OWNER, now);
    expect(replay).toMatchObject({ ok: true, replayed: true, invoiceNumber: result.invoiceNumber, orderId: result.orderId });

    const stored = await testDatabase.read(OWNER, (db) =>
      db.queryOne<{ payment_status: string; total: string; tax_rate: string; payments: number; change: string; invoice_status: string }>(
        `select o.payment_status, o.total::text, o.tax_rate::text,
                (select count(*) from payments p where p.order_id = o.id)::int as payments,
                (select change_amount::text from payments p where p.order_id = o.id) as change,
                (select status from fiscal_invoices f where f.order_id = o.id) as invoice_status
           from orders o where o.id = $1`,
        [result.orderId],
      ),
    );
    expect(stored).toEqual({ payment_status: "paid", total: "742.40", tax_rate: "16.0000", payments: 1, change: "257.60", invoice_status: "pending" });
  });

  it("taxes a card sale at the card rate and reports a total the till got wrong", async () => {
    const result = await applyPosOp(sale(ticket(), "card", "700.00"), owner, OWNER, now); // server: 640 + 8 % = 691.20
    expect(result.totalMismatch).toEqual({ expected: "700.00", actual: "691.20" });
  });

  it("refuses an invoice number this till already used for another sale", async () => {
    const used = seq;
    await expect(applyPosOp(sale(ticket(), "cash", "742.40", { seq: used }), owner, OWNER, now)).rejects.toMatchObject({ code: "INVOICE_SEQ_TAKEN" });
  });

  it("applies two concurrent deliveries of the same op once", async () => {
    const op = sale(ticket(), "cash", "742.40");
    const [a, b] = await Promise.all([applyPosOp(op, owner, OWNER, now), applyPosOp(op, owner, OWNER, now)]);
    expect(a.orderId).toBe(b.orderId);
    const count = await testDatabase.read(OWNER, (db) =>
      db.queryOne<{ n: number }>(`select count(*)::int as n from fiscal_invoices where order_id = $1`, [a.orderId]),
    );
    expect(count?.n).toBe(1);
  });
});

describe("fiscal queue, credit notes and day close", () => {
  it("retries a failed send and stores every request/response", async () => {
    setFiscalAdapterForTests(new MockFiscalAdapter({ failures: 1 }));
    const result = await applyPosOp(sale(ticket(), "cash", "742.40"), owner, OWNER, now);
    await submitFiscalNow(BELLA.restaurantId, [result.orderId!]);
    const failed = await testDatabase.read(OWNER, (db) =>
      db.queryOne<{ status: string; attempts: number; due_later: boolean }>(
        `select status, attempts, next_attempt_at > now() as due_later from fiscal_invoices where order_id = $1`,
        [result.orderId],
      ),
    );
    expect(failed).toEqual({ status: "failed", attempts: 1, due_later: true });

    // the next send goes through (the scheduled job takes failed invoices once their retry time comes)
    await submitFiscalNow(BELLA.restaurantId, [result.orderId!]);
    const synced = await testDatabase.read(OWNER, (db) =>
      db.queryOne<{ status: string; authority_invoice_number: string; log: string[] }>(
        `select f.status, f.authority_invoice_number,
                (select array_agg(outcome order by attempt) from fiscal_invoice_attempts a where a.fiscal_invoice_id = f.id) as log
           from fiscal_invoices f where f.order_id = $1`,
        [result.orderId],
      ),
    );
    expect(synced?.status).toBe("synced");
    expect(synced?.authority_invoice_number).toMatch(/^PRA-MOCK-/);
    expect(synced?.log).toEqual(["retryable", "synced"]);
    setFiscalAdapterForTests(new MockFiscalAdapter());
  });

  it("refunds a sale with a credit note, leaving the original invoice untouched", async () => {
    const result = await applyPosOp(sale(ticket(), "cash", "742.40", { tendered: "742.40" }), owner, OWNER, now);
    const original = await testDatabase.read(OWNER, (db) =>
      db.queryOne<{ id: string }>(`select id from fiscal_invoices where order_id = $1`, [result.orderId]),
    );
    const note = await issueCreditNote(
      { originalInvoiceId: original!.id, shiftId, invoiceSeq: ++seq, reason: "Wrong order", issuedAt: new Date().toISOString() },
      owner,
      OWNER,
    );
    expect(note).toMatchObject({ kind: "credit_note", total: "742.40" });
    await expect(
      issueCreditNote({ originalInvoiceId: original!.id, shiftId, invoiceSeq: ++seq, reason: "again", issuedAt: new Date().toISOString() }, owner, OWNER),
    ).rejects.toThrow(/already refunded/);
    const order = await testDatabase.read(OWNER, (db) =>
      db.queryOne<{ payment_status: string }>(`select payment_status from orders where id = $1`, [result.orderId]),
    );
    expect(order?.payment_status).toBe("refunded");
  });

  it("keeps issued invoices immutable and the audit log append-only", async () => {
    const invoice = await testDatabase.read(OWNER, (db) => db.queryOne<{ id: string }>(`select id from fiscal_invoices where shift_id = $1 limit 1`, [shiftId]));
    await expect(testDatabase.write(OWNER, (db) => db.query(`update fiscal_invoices set total = 1 where id = $1`, [invoice!.id]))).rejects.toThrow(/cannot be changed/);
    await expect(testDatabase.write(OWNER, (db) => db.query(`delete from fiscal_invoices where id = $1`, [invoice!.id]))).rejects.toThrow();
    await expect(testDatabase.write(OWNER, (db) => db.query(`update audit_log set action = 'x' where restaurant_id = $1`, [BELLA.restaurantId]))).rejects.toThrow();
  });

  it("blocks the day close while an invoice is unreported, then closes with the cash drawer count", async () => {
    setFiscalAdapterForTests(new MockFiscalAdapter({ reject: true }));
    await applyPosOp(sale(ticket(), "cash", "742.40"), owner, OWNER, now);
    await expect(closeShift({ shiftId, countedCash: "0" }, owner, OWNER)).rejects.toMatchObject({ code: "FISCAL_UNSYNCED" });

    setFiscalAdapterForTests(new MockFiscalAdapter());
    await testDatabase.write(OWNER, (db) => db.query(`update fiscal_invoices set next_attempt_at = now() where shift_id = $1 and status <> 'synced'`, [shiftId]));
    await drainFiscalQueue(10_000);
    const report = await getZReport(BELLA.restaurantId, shiftId, OWNER);
    expect(report?.fiscal).toMatchObject({ pending: 0, failed: 0 });
    const cash = report!.tenders.find((tender) => tender.tender === "cash")!;
    expect(report!.expectedCash).toBe((5000 + Number(cash.net)).toFixed(2));
    expect(Number(cash.refunded)).toBe(742.4);

    const closed = await closeShift({ shiftId, countedCash: report!.expectedCash }, owner, OWNER);
    expect(closed.report.difference).toBe("0.00");
    expect(closed.shift.status).toBe("closed");
    await expect(applyPosOp(sale(ticket(), "cash", "742.40"), owner, OWNER, now)).rejects.toMatchObject({ code: "SHIFT_CLOSED" });
    await expect(testDatabase.write(OWNER, (db) => db.query(`update pos_shifts set notes = 'x' where id = $1`, [shiftId]))).rejects.toThrow(/closed shift/);
  });
});
