import { z } from "zod";
import { contactPhone } from "./common";

export const bookTableSchema = z.object({
  locationId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Please choose a date."),
  time: z.string().regex(/^\d{2}:\d{2}$/, "Please choose a time."),
  guests: z.coerce.number().int().min(1).max(60),
  guestName: z.string().trim().min(2, "Please enter your name.").max(120),
  guestPhone: contactPhone,
  // required: the request and confirmation emails are the only way we reach the guest
  guestEmail: z.string().trim().min(1, "Please enter your email so we can confirm.").email("That email looks incomplete.").max(160),
  occasion: z.string().trim().max(60).optional().or(z.literal("")),
  specialRequests: z.string().trim().max(400).optional().or(z.literal("")),
});
export type BookTableInput = z.infer<typeof bookTableSchema>;
