'use server';

import type { ApiResult } from '@/shared/contract/api';
import { action } from '@/server/errors';
import { getCustomerUser } from '@/server/services/customer-auth';
import { previewCoupon } from '@/server/services/cart';
import { checkCouponSchema } from '@/server/validation/cart';
import { checkRateLimit } from '@/server/rate-limit';
import { callerIdentifier, getStorefrontCustomer } from '@/web/session';
import { requireStorefrontRestaurant } from '@/web/storefront';

/**
 * The tray has no server actions of its own: it is a browser cookie the tray provider writes directly
 * (`components/storefront/local-cart.tsx`, DECISIONS.md §28), so adding, changing and removing lines
 * never makes a request. The one exception is checking a promo code, which answers from the storefront
 * snapshot — still no database. The code is re-validated (usage limits included) inside the order
 * transaction, so a code that stops working in between never overcharges; the order just fails with
 * the reason. A code restricted to specific customers additionally reads the signed-in account's
 * email/mobile (one read, only for such a code); a guest gets the same "not valid" a wrong code gets.
 */
export async function checkCouponAction(
  slug: string,
  payload: unknown,
): Promise<ApiResult<{ code: string; discount: string }>> {
  return action(async () => {
    const input = checkCouponSchema.parse(payload);
    // a promo code is a short secret: stop one caller from trying them by the thousand
    checkRateLimit({ key: 'coupon-check', identifier: await callerIdentifier(), limit: 30, windowMs: 5 * 60_000 });
    const restaurant = await requireStorefrontRestaurant(slug);
    return previewCoupon(restaurant, input.code, input.orderType, input.subtotal, async () => {
      const customer = await getStorefrontCustomer(restaurant.id);
      const account = customer ? await getCustomerUser(customer.customerId) : null;
      return { email: account?.email ?? null, phone: account?.phone ?? null };
    });
  });
}
