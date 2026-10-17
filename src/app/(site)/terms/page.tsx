import type { Metadata } from "next";
import { LegalPage, legalPageMetadata } from "@/components/storefront/legal-page";

interface TermsPageProps {
  params: Promise<{ restaurantSlug: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: TermsPageProps): Promise<Metadata> {
  const { restaurantSlug } = await params;
  return legalPageMetadata(restaurantSlug, "terms");
}

export default async function TermsPage({ params }: TermsPageProps) {
  const { restaurantSlug } = await params;
  return <LegalPage restaurantSlug={restaurantSlug} kind="terms" />;
}
