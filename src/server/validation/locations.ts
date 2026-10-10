import { z } from "zod";
import { DAY_KEYS } from "@/shared/contract/enums";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 09:30.");
/** One opening window; open === close is the "open 24 hours" marker (shared/hours.ts), close < open runs past midnight. */
const window = z.object({ open: time, close: time });

/**
 * A branch's opening hours: day key → windows (lunch + dinner = two). A missing/empty day is closed that day.
 * `{}` = not set (the branch then takes orders at any time). All seven days closed is refused: it would be stored
 * as `{}` and read as "not set" (always open) — a closed branch is marked inactive instead.
 */
export const openingHoursSchema = z
  .object(Object.fromEntries(DAY_KEYS.map((day) => [day, z.array(window).max(3).optional()])) as Record<(typeof DAY_KEYS)[number], z.ZodOptional<z.ZodArray<typeof window>>>)
  .strict()
  .refine(
    (hours) => Object.keys(hours).length === 0 || Object.values(hours).some((windows) => (windows?.length ?? 0) > 0),
    "Open the branch on at least one day, or mark it inactive.",
  );

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
  /** omitted = keep the stored hours; {} = not set */
  hours: openingHoursSchema.optional(),
});
export type LocationFormInput = z.infer<typeof locationSchema>;
