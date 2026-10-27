import type { Metadata } from "next";
import { getHomePageContent } from "@/server/services/storefront";
import { getStorefrontContext, requireStorefront } from "@/web/storefront";
import { restaurantJsonLd } from "@/web/seo";
import { JsonLd } from "@/components/storefront/json-ld";
import { SectionRenderer } from "@/components/storefront/section-renderer";
import { getReviewSummary } from "@/server/services/reviews";
import { instanceRestaurantSlug } from "@/web/instance";
import MenuPage from "@/app/(site)/menu/page";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const restaurantSlug = instanceRestaurantSlug();
  try {
    const { restaurant, website } = await getStorefrontContext(restaurantSlug);
    const seo = website.seo as Record<string, string | undefined>;
    return {
      title: seo.title ?? `${restaurant.name} — ${restaurant.cuisines.slice(0, 2).join(" & ") || "Restaurant"}`,
      description: seo.description ?? restaurant.shortDescription ?? undefined,
      alternates: { canonical: "/" },
      openGraph: { url: "/", images: restaurant.coverUrl ? [restaurant.coverUrl] : undefined },
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
export default async function RestaurantHomePage(props: { searchParams: Parameters<typeof MenuPage>[0]["searchParams"] }) {
  const restaurantSlug = instanceRestaurantSlug();

  const context = await requireStorefront(restaurantSlug);

  const [page, ratings] = await Promise.all([
    getHomePageContent(context.restaurant.id),
    getReviewSummary(context.restaurant.id),
  ]);

  // the owner made the Menu page the home page: "/" IS the menu (a page_content body only exists in its own page)
  if (page?.slug === "menu") return <MenuPage searchParams={props.searchParams} />;

  const sections = page?.sections ?? [];

  return (
    <>
      <JsonLd data={restaurantJsonLd(context.restaurant, context.primaryLocation, ratings)} />
      {sections.length ? (
        <SectionRenderer context={context} sections={sections} />
      ) : (
        <div className="container-page py-16 text-center">
          <h1 className="text-3xl">{context.restaurant.name}</h1>
          <p className="mt-3 text-[var(--color-muted-ink)]">
            This website has no published sections yet. The menu is still available.
          </p>
        </div>
      )}
    </>
  );
}
