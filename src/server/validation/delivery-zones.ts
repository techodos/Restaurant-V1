import { z } from "zod";

const money = z
  .string()
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Enter an amount like 450 or 450.50");

export const deliveryZoneSchema = z.object({
  id: z.string().uuid().optional(),
  locationId: z.string().uuid("Choose a location."),
  name: z.string().trim().min(1, "Enter a zone name.").max(120),
  description: z.string().trim().max(300).optional().or(z.literal("")),
  areas: z.array(z.string().trim().max(80)).optional(),
  postalCodes: z.array(z.string().trim().max(20)).optional(),
  deliveryFee: money,
  minOrderAmount: money.optional().or(z.literal("")),
  freeDeliveryOver: money.optional().or(z.literal("")),
  etaMinMinutes: z.coerce.number().int().min(1).max(600).optional(),
  etaMaxMinutes: z.coerce.number().int().min(1).max(600).optional(),
  isActive: z.coerce.boolean().optional(),
  sortOrder: z.coerce.number().int().optional(),
});
export type DeliveryZoneFormInput = z.infer<typeof deliveryZoneSchema>;
