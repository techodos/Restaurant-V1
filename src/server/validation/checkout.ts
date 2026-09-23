import { z } from "zod";
import { ORDER_TYPES, PAYMENT_METHODS } from "@/shared/contract/enums";
import { e164Phone } from "./common";

export const placeOrderSchema = z.object({
  orderType: z.enum(ORDER_TYPES),
  fullName: z.string().trim().min(2, "Please enter your name.").max(120),
  phone: e164Phone,
  email: z.string().trim().email("That email address looks incomplete.").max(160),
  addressLine1: z.string().trim().max(200).optional().or(z.literal("")),
  addressLine2: z.string().trim().max(200).optional().or(z.literal("")),
  area: z.string().trim().max(120).optional().or(z.literal("")),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  postalCode: z.string().trim().max(20).optional().or(z.literal("")),
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
});
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
