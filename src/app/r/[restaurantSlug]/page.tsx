import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getHomePage } from "@/lib/db/websites";
import { getRatingBreakdown } from "@/lib/db/reviews";
import { EMPTY_CONTEXT } from "@/lib/db/pool";
import { getStorefrontContext } from "@/lib/services/storefront";
import { restaurantJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/storefront/json-ld";
import { SectionRenderer } from "@/components/storefront/section-renderer";

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

  let context;
  try {
    context = await getStorefrontContext(restaurantSlug);
  } catch {
    notFound();
  }

  const [page, ratings] = await Promise.all([
    getHomePage(context.restaurant.id, EMPTY_CONTEXT),
    getRatingBreakdown(context.restaurant.id, EMPTY_CONTEXT),
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
