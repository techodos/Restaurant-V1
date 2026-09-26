import { z } from "zod";
import { CUSTOMER_GENDERS } from "@/shared/contract/models";
import { e164Phone } from "./common";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value ? value : null));

/** "YYYY-MM-DD", a real calendar date, not in the future and not before 1900. Empty = not set. */
const dateOfBirth = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value ? value : null))
  .refine((value) => {
    if (value === null) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value) && value >= "1900-01-01" && date.getTime() <= Date.now();
  }, "Please enter a valid date of birth.");

/**
 * What a customer may change on their own profile. Name and email are deliberately absent (read-only
 * account identity). `phone` is optional so updating gender / date of birth never forces re-sending it.
 */
export const updateProfileSchema = z.object({
  phone: e164Phone.optional(),
  gender: z
    .enum(CUSTOMER_GENDERS)
    .optional()
    .or(z.literal("").transform(() => undefined))
    .transform((value) => value ?? null),
  dateOfBirth,
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/** A saved delivery address (create when `id` is absent, else update that address of the same customer). */
export const customerAddressSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(1, "Give the address a name, e.g. Home.").max(40),
  addressLine1: z.string().trim().min(3, "Please enter the street address.").max(200),
  addressLine2: optionalText(200),
  area: z.string().trim().min(2, "Please add the area, so we can match a delivery zone.").max(120),
  city: z.string().trim().min(2, "Please enter the city.").max(120),
  postalCode: optionalText(20),
  deliveryNotes: optionalText(300),
  isDefault: z.boolean().optional(),
});
export type CustomerAddressInput = z.infer<typeof customerAddressSchema>;
