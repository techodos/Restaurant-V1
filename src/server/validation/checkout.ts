import { z } from "zod";
import { ORDER_TYPES, PAYMENT_METHODS } from "@/shared/contract/enums";
import { e164Phone } from "./common";

/** Guest checkout OTP: the same fullName/phone/email already typed on the checkout form. */
export const guestContactSchema = z.object({
  fullName: z.string().trim().min(2, "Please enter your name.").max(120),
  phone: e164Phone,
  email: z.string().trim().email("That email address looks incomplete.").max(160),
});

/** The as-you-type account check: either field may be absent (only the valid ones are sent). */
export const guestContactCheckSchema = z.object({
  phone: e164Phone.optional(),
  email: guestContactSchema.shape.email.optional(),
});

export const guestVerifyCodeSchema = guestContactSchema.extend({
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code."),
});

/** Re-prices the checkout ticket for a newly chosen payment method (tax varies by method — see domain/pricing.ts). */
export const repriceCheckoutSchema = z.object({
  paymentMethod: z.enum(PAYMENT_METHODS),
});

export const placeOrderSchema = z.object({
  orderType: z.enum(ORDER_TYPES),
  fullName: z.string().trim().min(2, "Please enter your name.").max(120),
  phone: e164Phone,
  // optional here: the standard checkout requires it (services/checkout.ts#placeOrder), WhatsApp checkout does not
  email: z.string().trim().email("That email address looks incomplete.").max(160).optional().or(z.literal("")),
  addressLine1: z.string().trim().max(200).optional().or(z.literal("")),
  addressLine2: z.string().trim().max(200).optional().or(z.literal("")),
  area: z.string().trim().max(120).optional().or(z.literal("")),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  postalCode: z.string().trim().max(20).optional().or(z.literal("")),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  deliveryZoneId: z.string().uuid().optional().or(z.literal("")),
  tableNumber: z.string().trim().max(20).optional().or(z.literal("")),
  guests: z.coerce.number().int().min(1).max(60).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS),
  couponCode: z.string().trim().max(40).optional().or(z.literal("")),
  tipAmount: z
    .string()
    .trim()
    .regex(/^\d+(\.\d{1,2})?$/, "Enter a tip amount like 150 or 150.50")
    .optional()
    .or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  /** "Save this address for next time": the name to save a NEW delivery address under (e.g. "Home"); empty = don't save */
  saveAddressAs: z.string().trim().max(40).optional().or(z.literal("")),
  /** one random key per checkout: a retried or doubled "Place order" returns the first order (0033) */
  idempotencyKey: z.string().uuid().optional(),
});
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
