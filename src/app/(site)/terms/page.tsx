import type { Metadata } from "next";
import { LegalPage, legalPageMetadata } from "@/components/storefront/legal-page";
import { instanceRestaurantSlug } from "@/web/instance";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const restaurantSlug = instanceRestaurantSlug();
  return legalPageMetadata(restaurantSlug, "terms");
}

export default async function TermsPage() {
  const restaurantSlug = instanceRestaurantSlug();
  return <LegalPage restaurantSlug={restaurantSlug} kind="terms" />;
}
