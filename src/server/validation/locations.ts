import { z } from "zod";

export const locationSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "Enter a location name.").max(120),
  isPrimary: z.coerce.boolean().optional(),
  isActive: z.coerce.boolean().optional(),
  addressLine1: z.string().trim().max(200).optional().or(z.literal("")),
  addressLine2: z.string().trim().max(200).optional().or(z.literal("")),
  area: z.string().trim().max(120).optional().or(z.literal("")),
  // the city is the hard boundary of delivery coverage (deliveries.ts#servingZones): a branch needs one
  city: z.string().trim().min(2, "Enter the branch's city.").max(120),
  state: z.string().trim().max(120).optional().or(z.literal("")),
  postalCode: z.string().trim().max(20).optional().or(z.literal("")),
  country: z.string().trim().max(2).optional().or(z.literal("")),
  phone: z.string().trim().max(24).optional().or(z.literal("")),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  sortOrder: z.coerce.number().int().optional(),
  /** the branch's map pin: distances, and the centre of a delivery radius */
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
});
export type LocationFormInput = z.infer<typeof locationSchema>;
