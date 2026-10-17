import type { Metadata } from "next";
import { LegalPage, legalPageMetadata } from "@/components/storefront/legal-page";

interface PrivacyPageProps {
  params: Promise<{ restaurantSlug: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PrivacyPageProps): Promise<Metadata> {
  const { restaurantSlug } = await params;
  return legalPageMetadata(restaurantSlug, "privacy");
}

export default async function PrivacyPage({ params }: PrivacyPageProps) {
  const { restaurantSlug } = await params;
  return <LegalPage restaurantSlug={restaurantSlug} kind="privacy" />;
}
