import { z } from "zod";

export const locationSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Enter a location name.").max(120),
  isPrimary: z.coerce.boolean().optional(),
  isActive: z.coerce.boolean().optional(),
  addressLine1: z.string().trim().max(200).optional().or(z.literal("")),
  addressLine2: z.string().trim().max(200).optional().or(z.literal("")),
  area: z.string().trim().max(120).optional().or(z.literal("")),
  city: z.string().trim().max(120).optional().or(z.literal("")),
  state: z.string().trim().max(120).optional().or(z.literal("")),
  postalCode: z.string().trim().max(20).optional().or(z.literal("")),
  country: z.string().trim().max(2).optional().or(z.literal("")),
  phone: z.string().trim().max(24).optional().or(z.literal("")),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  sortOrder: z.coerce.number().int().optional(),
});
export type LocationFormInput = z.infer<typeof locationSchema>;
