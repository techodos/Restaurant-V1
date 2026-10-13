import { z } from "zod";

/**
 * Distance-based delivery pricing: fixed fees for distance slabs ("0–1 km → Rs 100", "1–3 km → Rs 120", …),
 * configured per branch (`restaurant1s.settings.deliveryPricing`). Separate from delivery ZONES
 * (`delivery_zones` — which address the branch serves at all, by drawn area / radius / area name) and
 * from a zone's own flat `deliveryFee`: a zone still decides WHETHER an address is served; when the branch
 * also has distance pricing configured and the customer's pin (not a typed address) is known, the matching
 * slab's fee REPLACES the zone's flat fee — see `resolveDeliveryFee` in `server/repositories/deliveries.ts`.
 *
 * A slab's lower bound is implicit — the previous slab's `maxKm` (0 for the first) — so the data shape
 * itself cannot express an overlap or a gap; only the upper bounds and fees are stored, always ascending.
 */

export const deliverySlabSchema = z.object({
  /** this slab covers up to AND INCLUDING this distance, in km, from the one before it (0 for the first slab) */
  maxKm: z.coerce.number().positive("Enter a distance greater than 0.").max(500, "Use 500 km or less."),
  /** fixed fee for the whole slab — never a per-km rate */
  fee: z.coerce.number().min(0, "Enter a fee of 0 or more.").max(1_000_000, "That fee looks too high."),
});
export type DeliverySlab = z.infer<typeof deliverySlabSchema>;

export const deliveryPricingSchema = z.object({
  slabs: z
    .array(deliverySlabSchema)
    .min(1, "Add at least one distance range, or remove delivery pricing entirely.")
    .max(12, "Use at most 12 distance ranges.")
    .refine(
      (slabs) => slabs.every((slab, index) => index === 0 || slab.maxKm > slabs[index - 1]!.maxKm),
      "Each distance must be greater than the one before it.",
    ),
});
export type DeliveryPricing = z.infer<typeof deliveryPricingSchema>;

/**
 * Tolerant reader for a location's stored `settings.deliveryPricing` (untrusted JSONB: a legacy row, a
 * hand-edited one, or simply none). Invalid or missing data means "not configured" — the branch's zones
 * keep using their own flat fee — never thrown.
 */
export function parseDeliveryPricing(raw: unknown): DeliveryPricing | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = deliveryPricingSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * The slab covering `distanceKm`, or null when it is beyond every configured slab (delivery is not
 * available at that distance, even though the zone itself may have matched by name or drawn area).
 * Slabs are ascending `maxKm`; the boundary itself belongs to the lower slab (exactly 1 km → the 0–1 km
 * slab, not 1–3 km) — `distanceKm` is a measurement, so a hair's-width of floating-point error at the
 * boundary is absorbed rather than bumping a customer to the next slab.
 */
export function matchDeliverySlab(pricing: DeliveryPricing, distanceKm: number): DeliverySlab | null {
  const EPSILON_KM = 1e-9;
  return pricing.slabs.find((slab) => distanceKm <= slab.maxKm + EPSILON_KM) ?? null;
}
