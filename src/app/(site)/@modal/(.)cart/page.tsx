import { requireStorefront } from "@/web/storefront";
import { CartView } from "@/components/storefront/cart-view";
import { instanceRestaurantSlug } from "@/web/instance";

/**
 * Opening the tray from anywhere in the storefront intercepts /cart and shows it in the
 * drawer (layout.tsx) over the current page; a reload renders the full cart page.
 */
export default async function TrayDrawer() {
  const restaurantSlug = instanceRestaurantSlug();
  const context = await requireStorefront(restaurantSlug);
  return <CartView context={context} variant="drawer" />;
}
