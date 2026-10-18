import type { Metadata } from "next";
import { getPlatformRestaurant } from "@/web/platform";
import { EntitlementsForm } from "@/components/super-admin/entitlements-form";
import { CheckoutModeForm } from "@/components/super-admin/checkout-mode-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Features & menus" };

export default async function SuperAdminFeaturesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const restaurant = await getPlatformRestaurant(slug); // same request-cached read as the layout
  return (
    <div className="space-y-6">
      <CheckoutModeForm restaurantId={restaurant.id} checkoutMode={restaurant.checkoutMode} whatsapp={restaurant.whatsapp} />
      <EntitlementsForm restaurantId={restaurant.id} entitlements={restaurant.entitlements} />
    </div>
  );
}
