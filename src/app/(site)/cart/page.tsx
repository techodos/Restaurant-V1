import type { Metadata } from 'next';
import { requireStorefront } from '@/web/storefront';
import { CartView } from '@/components/storefront/cart-view';
import { instanceRestaurantSlug } from "@/web/instance";

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'My Cart',
  robots: { index: false, follow: false },
};

/** Full-page tray (direct visits, reloads). In-app navigation opens the same view as a drawer. */
export default async function CartPage() {
  const restaurantSlug = instanceRestaurantSlug();
  const context = await requireStorefront(restaurantSlug);
  return <CartView context={context} variant='page' />;
}
