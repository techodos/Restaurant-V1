import { z } from "zod";
import { polygonProblem, type Polygon } from "@/shared/geo";

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
  /** how this zone decides coverage; "areas" = names only (the old behaviour) */
  coverage: z.enum(["areas", "radius", "polygon"]).default("areas"),
  radiusKm: z.coerce.number().min(0.2, "At least 0.2 km.").max(100, "At most 100 km.").optional(),
  polygon: z.array(z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)])).max(200).optional(),
}).superRefine((value, ctx) => {
  if (value.coverage === "radius" && value.radiusKm === undefined) {
    ctx.addIssue({ code: "custom", path: ["radiusKm"], message: "Enter the delivery radius in km." });
  }
  if (value.coverage === "polygon") {
    const problem = polygonProblem((value.polygon ?? []) as Polygon);
    if (problem) ctx.addIssue({ code: "custom", path: ["polygon"], message: problem });
  }
  if (value.coverage === "areas" && !(value.areas ?? []).some(Boolean) && !(value.postalCodes ?? []).some(Boolean)) {
    ctx.addIssue({ code: "custom", path: ["areas"], message: "List at least one area or postal code, or switch to radius / map area." });
  }
});
export type DeliveryZoneFormInput = z.infer<typeof deliveryZoneSchema>;
