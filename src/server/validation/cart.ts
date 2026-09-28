import { z } from "zod";
import { ORDER_TYPES } from "@/shared/contract/enums";

/**
 * The tray itself is never sent as a payload: it travels in its own cookie and is parsed defensively by
 * `shared/tray.ts#decodeTray` (then every id is re-resolved against the menu). Only the promo-code
 * preview takes input.
 */

/** A single explicit-action promo check against the tray's subtotal (cart page). */
export const checkCouponSchema = z.object({
  code: z.string().trim().max(40),
  orderType: z.enum(ORDER_TYPES),
  subtotal: z.string().regex(/^\d+(\.\d{1,2})?$/),
});
export type CheckCouponInput = z.infer<typeof checkCouponSchema>;
