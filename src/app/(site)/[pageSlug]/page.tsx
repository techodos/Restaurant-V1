import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPageContent } from "@/server/services/storefront";
import { getStorefrontContext, requireStorefront } from "@/web/storefront";
import { SectionRenderer } from "@/components/storefront/section-renderer";

interface ContentPageProps {
  params: Promise<{ restaurantSlug: string; pageSlug: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: ContentPageProps): Promise<Metadata> {
  const { restaurantSlug, pageSlug } = await params;
  try {
    const { restaurant } = await getStorefrontContext(restaurantSlug);
    const page = await getPageContent(restaurant.id, pageSlug);
    if (!page) return { title: "Page not found" };
    return {
      title: page.title,
      description: page.description ?? restaurant.shortDescription ?? undefined,
      alternates: { canonical: `/r/${restaurant.slug}/${page.slug}` },
    };
  } catch {
    return { title: "Page" };
  }
}

/**
 * Any published website page other than home (about, contact, ...): its sections come from
 * website_pages.sections and are rendered by the same SectionRenderer as the home page. Static routes
 * (menu, cart, reviews, ...) take precedence over this segment; an unknown or unpublished slug is a 404.
 */
export default async function ContentPage({ params }: ContentPageProps) {
  const { restaurantSlug, pageSlug } = await params;
  const context = await requireStorefront(restaurantSlug);
  const page = await getPageContent(context.restaurant.id, pageSlug);
  if (!page) notFound();

  return <SectionRenderer context={context} sections={page.sections} />;
}
