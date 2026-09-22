import { z } from "zod";
import { COUPON_DISCOUNT_TYPES, ORDER_TYPES } from "@/shared/contract/enums";

const money = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Enter an amount like 450 or 450.50");

export const couponSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(2, "Enter a code.").max(40),
  description: z.string().trim().max(300).optional().or(z.literal("")),
  discountType: z.enum(COUPON_DISCOUNT_TYPES),
  discountValue: money,
  minOrderAmount: money.optional().or(z.literal("")),
  maxDiscountAmount: money.optional().or(z.literal("")),
  appliesTo: z.enum(["order", "delivery_fee"]).optional(),
  // empty selection means "no restriction" — omit the field entirely so the
  // repository's coalesce() falls back to every order type, not an empty array
  orderTypes: z
    .array(z.enum(ORDER_TYPES))
    .optional()
    .transform((value) => (value && value.length > 0 ? value : undefined)),
  startsAt: z.string().trim().optional().or(z.literal("")),
  endsAt: z.string().trim().optional().or(z.literal("")),
  usageLimit: z.coerce.number().int().min(1).optional(),
  usageLimitPerCustomer: z.coerce.number().int().min(1).optional(),
  isActive: z.coerce.boolean().optional(),
});
export type CouponFormInput = z.infer<typeof couponSchema>;
