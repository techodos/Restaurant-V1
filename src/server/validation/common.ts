import { z } from "zod";

/** Phone numbers are stored as typed; this only rejects obviously invalid input. */
export const contactPhone = z
  .string()
  .trim()
  .min(7, "Please enter a contact number.")
  .max(24)
  .regex(/^[+0-9()\s-]+$/, "Please enter a valid phone number.");
