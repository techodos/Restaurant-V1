import type { Metadata } from "next";
import { requireStorefront } from "@/web/storefront";
import { CartView } from "@/components/storefront/cart-view";

interface CartPageProps {
  params: Promise<{ restaurantSlug: string }>;
}

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Your tray", robots: { index: false, follow: false } };

/** Full-page tray (direct visits, reloads). In-app navigation opens the same view as a drawer. */
export default async function CartPage({ params }: CartPageProps) {
  const { restaurantSlug } = await params;
  const context = await requireStorefront(restaurantSlug);
  return <CartView context={context} variant="page" />;
}
