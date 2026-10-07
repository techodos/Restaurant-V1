import { z } from "zod";

/**
 * A delivery destination chosen on the menu (map pin, address search, a saved address, or typed in).
 * It only decides which branches are offered; the order re-validates the real address against the
 * chosen branch's zones when it is placed.
 */
export const destinationSchema = z
  .object({
    label: z.string().trim().max(120).default(""),
    line1: z.string().trim().max(200).default(""),
    area: z.string().trim().max(120).default(""),
    city: z.string().trim().max(120).default(""),
    postalCode: z.string().trim().max(20).default(""),
    latitude: z.number().min(-90).max(90).nullable().default(null),
    longitude: z.number().min(-180).max(180).nullable().default(null),
    addressId: z.string().trim().max(64).nullable().default(null),
  })
  // the city is the hard boundary of delivery coverage (deliveries.ts#servingZones): without it no branch
  // can be matched, so ask for it here instead of failing later
  .refine((value) => Boolean(value.city), { path: ["city"], message: "Add the city, so we can find the branch that delivers there." });
export type DestinationInput = z.infer<typeof destinationSchema>;
