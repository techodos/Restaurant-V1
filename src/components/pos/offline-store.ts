"use client";

import Dexie, { type Table } from "dexie";
import type { PosBootstrap, PosOp, PosShift } from "@/shared/pos";
import type { ReceiptDocument } from "@/shared/pos-receipt";
import type { Ticket } from "./ticket";

/**
 * The till's IndexedDB (Dexie): what must survive a reload, a power cut or a day without internet (SKILL.md §43).
 *   queue     every action not yet confirmed by the server, in order (each op has its own id = idempotency key)
 *   failed    ops the server refused for good (shown to the cashier; never retried)
 *   tickets   open tickets (dine-in tabs sent to the kitchen, not paid yet)
 *   receipts  receipts printed on this till (reprint; PRA number filled in when the server reports it)
 *   kv        bootstrap (menu, settings), this till's id, its shift, its invoice counter
 */

export interface QueuedOp {
  seq?: number;
  id: string;
  op: PosOp;
  createdAt: string;
  attempts: number;
  lastError: string | null;
}

export interface FailedOp {
  id: string;
  op: PosOp;
  error: { code: string; message: string };
  at: string;
}

export interface SavedReceipt {
  /** the ticket's clientOrderId (or the credit note's id) */
  id: string;
  doc: ReceiptDocument;
  orderId: string | null;
  createdAt: string;
}

interface KeyValue {
  key: string;
  value: unknown;
}

class PosDatabase extends Dexie {
  queue!: Table<QueuedOp, number>;
  failed!: Table<FailedOp, string>;
  tickets!: Table<Ticket, string>;
  receipts!: Table<SavedReceipt, string>;
  kv!: Table<KeyValue, string>;

  constructor() {
    super("techodos-pos");
    this.version(1).stores({
      queue: "++seq, &id",
      failed: "id, at",
      tickets: "clientOrderId, updatedAt",
      receipts: "id, createdAt, orderId",
      kv: "key",
    });
  }
}

let database: PosDatabase | null = null;

/** One connection per tab (IndexedDB transactions still serialise across tabs). */
export function posDb(): PosDatabase {
  database ??= new PosDatabase();
  return database;
}

async function getValue<T>(key: string): Promise<T | null> {
  return ((await posDb().kv.get(key))?.value as T | undefined) ?? null;
}

async function setValue(key: string, value: unknown): Promise<void> {
  if (value === null || value === undefined) await posDb().kv.delete(key);
  else await posDb().kv.put({ key, value });
}

export const store = {
  bootstrap: () => getValue<PosBootstrap>("bootstrap"),
  saveBootstrap: (value: PosBootstrap) => setValue("bootstrap", value),
  deviceId: () => getValue<string>("deviceId"),
  saveDeviceId: (value: string | null) => setValue("deviceId", value),
  shift: (deviceId: string) => getValue<PosShift>(`shift:${deviceId}`),
  saveShift: (deviceId: string, value: PosShift | null) => setValue(`shift:${deviceId}`, value),
  currentTicketId: (deviceId: string) => getValue<string>(`ticket:${deviceId}`),
  saveCurrentTicketId: (deviceId: string, value: string | null) => setValue(`ticket:${deviceId}`, value),
};

/**
 * The next invoice number of THIS till, assigned locally so it works offline. Never below what the server has seen
 * (`serverLast`, after a reinstall), never handed out twice (one IndexedDB transaction, even across tabs).
 */
export async function nextInvoiceSeq(deviceId: string, serverLast: number): Promise<number> {
  const db = posDb();
  return db.transaction("rw", db.kv, async () => {
    const key = `seq:${deviceId}`;
    const current = Math.max(((await db.kv.get(key))?.value as number | undefined) ?? 0, serverLast);
    const next = current + 1;
    await db.kv.put({ key, value: next });
    return next;
  });
}

/** After the server reports a number this till cannot use (INVOICE_SEQ_TAKEN): skip ahead past it. */
export async function bumpInvoiceSeq(deviceId: string, atLeast: number): Promise<void> {
  const db = posDb();
  await db.transaction("rw", db.kv, async () => {
    const key = `seq:${deviceId}`;
    const current = ((await db.kv.get(key))?.value as number | undefined) ?? 0;
    if (atLeast > current) await db.kv.put({ key, value: atLeast });
  });
}
