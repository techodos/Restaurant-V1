import { z } from "zod";
import { POS_ORDER_TYPES, POS_TENDERS } from "@/shared/pos";

/** Input schemas for the POS route handlers (/pos/api/*). Money is a decimal string, like everywhere else. */

const money = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => /^\d{1,10}(\.\d{1,2})?$/.test(value), "must be an amount like 1250 or 1250.50")
  .transform((value) => Number(value).toFixed(2));

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null);

export const posLineSchema = z.object({
  clientLineId: z.string().uuid(),
  menuItemId: z.string().uuid(),
  variantId: z.string().uuid().nullable().default(null),
  quantity: z.coerce.number().int().min(1).max(99),
  addons: z.array(z.object({ addonId: z.string().uuid(), quantity: z.coerce.number().int().min(1).max(20) })).max(30).default([]),
  notes: optionalText(300),
});

export const posTicketSchema = z
  .object({
    clientOrderId: z.string().uuid(),
    orderType: z.enum(POS_ORDER_TYPES as unknown as ["dine_in", "pickup", "delivery"]),
    tableNumber: optionalText(20),
    guests: z.coerce.number().int().min(1).max(200).nullish().transform((value) => value ?? null),
    customerName: optionalText(120),
    customerPhone: optionalText(30),
    address: optionalText(300),
    notes: optionalText(500),
    lines: z.array(posLineSchema).max(200),
  })
  .superRefine((ticket, ctx) => {
    if (ticket.orderType === "delivery" && (!ticket.customerPhone || !ticket.address)) {
      ctx.addIssue({ code: "custom", path: ["address"], message: "A delivery order needs the customer's phone and address." });
    }
  });

export const posTenderSchema = z.object({
  clientPaymentId: z.string().uuid(),
  tender: z.enum(POS_TENDERS),
  amount: money,
  tendered: money.nullish().transform((value) => value ?? null),
});

export const posSaleSchema = z.object({
  clientOrderId: z.string().uuid(),
  invoiceSeq: z.coerce.number().int().min(1).max(999_999_999),
  issuedAt: z.string().datetime({ offset: true }),
  tenders: z.array(posTenderSchema).min(1).max(5),
  expectedTotal: money,
});

export const posOpSchema = z.discriminatedUnion("kind", [
  z.object({ id: z.string().uuid(), kind: z.literal("ticket"), shiftId: z.string().uuid(), ticket: posTicketSchema }),
  z.object({ id: z.string().uuid(), kind: z.literal("sale"), shiftId: z.string().uuid(), ticket: posTicketSchema, sale: posSaleSchema }),
]);

export const posSyncSchema = z.object({ ops: z.array(posOpSchema).min(1).max(50) });

export const registerDeviceSchema = z.object({
  locationId: z.string().uuid(),
  name: z.string().trim().min(1).max(60),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,8}$/, "2–8 letters or digits, e.g. GUL1"),
});

export const openShiftSchema = z.object({ deviceId: z.string().uuid(), openingFloat: money });

export const closeShiftSchema = z.object({ shiftId: z.string().uuid(), countedCash: money, notes: optionalText(500) });

export const refundSchema = z.object({
  invoiceId: z.string().uuid(),
  shiftId: z.string().uuid(),
  invoiceSeq: z.coerce.number().int().min(1).max(999_999_999),
  issuedAt: z.string().datetime({ offset: true }),
  reason: z.string().trim().min(3).max(300),
});
