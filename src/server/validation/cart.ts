import { z } from "zod";
import { ORDER_TYPES } from "@/shared/contract/enums";

export const addToCartSchema = z.object({
  menuItemId: z.string().uuid(),
  variantId: z.string().uuid().nullish(),
  quantity: z.coerce.number().int().min(1).max(99).default(1),
  addons: z
    .array(
      z.object({
        addonId: z.string().uuid(),
        quantity: z.coerce.number().int().min(1).max(20).default(1),
      }),
    )
    .max(30)
    .default([]),
  specialInstructions: z.string().trim().max(280).optional(),
  orderType: z.enum(ORDER_TYPES).optional(),
});
export type AddToCartInput = z.infer<typeof addToCartSchema>;

export const updateCartItemSchema = z.object({
  cartItemId: z.string().uuid(),
  quantity: z.coerce.number().int().min(0).max(99),
});
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;

export const removeCartItemSchema = z.object({ cartItemId: z.string().uuid() });

export const applyCouponSchema = z.object({ code: z.string().trim().max(40) });

export const setOrderTypeSchema = z.object({ orderType: z.enum(ORDER_TYPES) });

export const setCartLocationSchema = z.object({ locationId: z.string().uuid() });
