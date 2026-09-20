import type { Metadata } from "next";
import { getHomePageContent } from "@/server/services/storefront";
import { getStorefrontContext, requireStorefront } from "@/web/storefront";
import { restaurantJsonLd } from "@/web/seo";
import { JsonLd } from "@/components/storefront/json-ld";
import { SectionRenderer } from "@/components/storefront/section-renderer";
import { getReviewSummary } from "@/server/services/reviews";

interface HomePageProps {
  params: Promise<{ restaurantSlug: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: HomePageProps): Promise<Metadata> {
  const { restaurantSlug } = await params;
  try {
    const { restaurant, website } = await getStorefrontContext(restaurantSlug);
    const seo = website.seo as Record<string, string | undefined>;
    return {
      title: seo.title ?? `${restaurant.name} — ${restaurant.cuisines.slice(0, 2).join(" & ") || "Restaurant"}`,
      description: seo.description ?? restaurant.shortDescription ?? undefined,
      alternates: { canonical: `/r/${restaurant.slug}` },
      openGraph: { url: `/r/${restaurant.slug}`, images: restaurant.coverUrl ? [restaurant.coverUrl] : undefined },
    };
  } catch {
    return { title: "Restaurant" };
  }
}

/**
 * The restaurant home page: every block below comes from
 * website_pages.sections for the page flagged is_home, rendered by the shared
 * SectionRenderer (unknown sections are skipped, never fatal).
 */
export default async function RestaurantHomePage({ params }: HomePageProps) {
  const { restaurantSlug } = await params;

  const context = await requireStorefront(restaurantSlug);

  const [page, ratings] = await Promise.all([
    getHomePageContent(context.restaurant.id),
    getReviewSummary(context.restaurant.id),
  ]);

  const sections = page?.sections ?? [];

  return (
    <>
      <JsonLd data={restaurantJsonLd(context.restaurant, context.primaryLocation, ratings)} />
      {sections.length ? (
        <SectionRenderer context={context} sections={sections} />
      ) : (
        <div className="container-page py-24 text-center">
          <h1 className="text-3xl font-semibold">{context.restaurant.name}</h1>
          <p className="mt-3 text-[var(--color-muted-ink)]">
            This website has no published sections yet. The menu is still available.
          </p>
        </div>
      )}
    </>
  );
}
