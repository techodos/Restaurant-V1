import { z } from "zod";
import { isValidPhoneNumber, parsePhoneNumber } from "libphonenumber-js";
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
  // raw pasted text, one email or phone number per line (commas also accepted); empty = no
  // restriction. Parsed into eligibleEmails/eligiblePhones by parseCouponEligibility (services/coupons.ts).
  eligibleCustomers: z.string().trim().max(4000).optional().or(z.literal("")),
});
export type CouponFormInput = z.infer<typeof couponSchema>;

/**
 * Splits the admin's pasted list (newline/comma/semicolon separated) into normalised emails and
 * phone numbers, matched against a signed-in customer's own email/phone at redemption
 * (`validateCouponOrThrow`, `server/domain/pricing.ts`). An entry containing "@" is treated as an
 * email (lowercased, trimmed); anything else is treated as a phone number and normalised to E.164
 * when it parses as one — it must include a country code (e.g. "+92...") to match, the same format
 * every customer's phone is already stored in. An entry that doesn't parse is kept as typed (best
 * effort) rather than silently dropped, so a typo stays visible in the saved list instead of vanishing.
 */
export function parseCouponEligibility(raw: string | undefined): { emails: string[]; phones: string[] } {
  const entries = (raw ?? "")
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const emails = new Set<string>();
  const phones = new Set<string>();
  for (const entry of entries) {
    if (entry.includes("@")) {
      emails.add(entry.toLowerCase());
      continue;
    }
    if (entry.startsWith("+") && isValidPhoneNumber(entry)) {
      phones.add(parsePhoneNumber(entry).number);
    } else {
      phones.add(entry);
    }
  }
  return { emails: [...emails], phones: [...phones] };
}
