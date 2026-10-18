import { normalizeWhatsAppNumber } from "@/shared/whatsapp-order";
import { z } from "zod";
import { isValidPhoneNumber, parsePhoneNumber } from "libphonenumber-js";

/** Phone numbers are stored as typed; this only rejects obviously invalid input. */
export const contactPhone = z
  .string()
  .trim()
  .min(7, "Please enter a contact number.")
  .max(24)
  .regex(/^[+0-9()\s-]+$/, "Please enter a valid phone number.");

/**
 * Full international number (the country-code picker always sends a leading "+"), validated and
 * normalised to E.164 (e.g. "+923001234567") so the same customer's number is stored the same way
 * everywhere instead of whatever spacing/dashes they typed.
 */
export const e164Phone = z
  .string()
  .trim()
  .min(7, "Please enter a contact number.")
  .max(24)
  .refine((value) => value.startsWith("+") && isValidPhoneNumber(value), "Please enter a valid phone number.")
  .transform((value) => parsePhoneNumber(value).number);

/** A WhatsApp number field: "+<digits>" when usable, "" = clear it; anything else is refused with a message. */
export const whatsappNumberField = z
  .string()
  .trim()
  .max(32)
  .transform((value, issue) => {
    const normalised = normalizeWhatsAppNumber(value);
    if (normalised === null) {
      issue.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a WhatsApp number with country code, e.g. +92 300 1234567." });
      return z.NEVER;
    }
    return normalised;
  });

