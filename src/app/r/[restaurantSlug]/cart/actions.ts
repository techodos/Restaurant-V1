'use server';

import type { ApiResult } from '@/shared/contract/api';
import { action } from '@/server/errors';
import { previewCoupon } from '@/server/services/cart';
import { checkCouponSchema } from '@/server/validation/cart';
import { requireStorefrontRestaurant } from '@/web/storefront';

/**
 * The tray has no server actions of its own: it is a browser cookie the tray provider writes directly
 * (`components/storefront/local-cart.tsx`, DECISIONS.md §28), so adding, changing and removing lines
 * never makes a request. The one exception is checking a promo code, which answers from the storefront
 * snapshot — still no database. The code is re-validated (usage limits included) inside the order
 * transaction, so a code that stops working in between never overcharges; the order just fails with
 * the reason.
 */
export async function checkCouponAction(
  slug: string,
  payload: unknown,
): Promise<ApiResult<{ code: string; discount: string }>> {
  return action(async () => {
    const input = checkCouponSchema.parse(payload);
    const restaurant = await requireStorefrontRestaurant(slug);
    return previewCoupon(restaurant, input.code, input.orderType, input.subtotal);
  });
}
