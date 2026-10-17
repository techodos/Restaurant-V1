import { requireStorefront } from "@/web/storefront";
import { CartView } from "@/components/storefront/cart-view";

interface TrayDrawerProps {
  params: Promise<{ restaurantSlug: string }>;
}

/**
 * Opening the tray from anywhere in the storefront intercepts /r/<slug>/cart and shows it in the
 * drawer (layout.tsx) over the current page; a reload renders the full cart page.
 */
export default async function TrayDrawer({ params }: TrayDrawerProps) {
  const { restaurantSlug } = await params;
  const context = await requireStorefront(restaurantSlug);
  return <CartView context={context} variant="drawer" />;
}
