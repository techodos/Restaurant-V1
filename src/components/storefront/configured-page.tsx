import type { Metadata } from "next";
import { parseSections } from "@/shared/contract/sections";
import type { StorefrontContext, WebsitePage } from "@/shared/contract/models";
import { getPageContent } from "@/server/services/storefront";
import { requireStorefront } from "@/web/storefront";
import { resolveImage } from "@/web/media";
import { SectionRenderer } from "@/components/storefront/section-renderer";

/**
 * Menu, reservation, reviews and locations are functional pages (filters, booking form, review form) whose
 * layout is still configured like home/about/contact: each has a `website_pages` row (slug menu | reservation |
 * reviews | locations) with configurable `sections`. Privacy and terms work the same way; their built-in body
 * is the default legal template (shared/legal.ts). A `page_content` section marks where the functional body sits
 * among them and can override the body's heading. A missing, unpublished or empty page falls back to the body alone,
 * so a restaurant with no such row keeps working exactly as before.
 */

export interface PageHeading {
  title: string | undefined;
  subtitle: string | undefined;
  /** configured hero photo URL (already resolved); undefined => the page falls back to the restaurant's cover */
  image: string | undefined;
  /** true when the body opens the page (no configured section above it), so it may run under the header */
  leading: boolean;
}

export type FunctionalPageSlug = "menu" | "reservation" | "reviews" | "locations" | "privacy" | "terms";

interface ConfiguredPageProps {
  restaurantSlug: string;
  pageSlug: FunctionalPageSlug;
  /** builds the built-in body; receives the storefront context and the configured heading overrides */
  render: (context: StorefrontContext, heading: PageHeading) => Promise<React.ReactNode>;
  /**
   * Legal pages: when the restaurant's own page has visible sections but no `page_content` marker, those
   * sections ARE the page (its own policy text) and the built-in template is not rendered; this frames them
   * (e.g. the page's own title in a hero). Without it, the body follows the sections, as on the other pages.
   */
  ownContent?: (context: StorefrontContext, page: WebsitePage, sections: React.ReactNode) => React.ReactNode;
}

export async function ConfiguredPage({ restaurantSlug, pageSlug, render, ownContent }: ConfiguredPageProps) {
  const context = await requireStorefront(restaurantSlug);
  const page = await getPageContent(context.restaurant.id, pageSlug);
  const visible = parseSections(page?.sections).filter((section) => section.enabled);
  const marker = visible.find((section) => section.type === "page_content");
  if (ownContent && page && visible.length > 0 && !marker) {
    return ownContent(context, page, <SectionRenderer context={context} sections={page.sections} />);
  }
  const body = await render(context, {
    title: marker?.title,
    subtitle: marker?.subtitle,
    image: resolveImage(marker?.image?.url) ?? undefined,
    leading: visible.length === 0 || visible[0]?.type === "page_content",
  });
  return <SectionRenderer context={context} sections={page?.sections ?? []} body={body} />;
}

/** Title / description for `generateMetadata`: the page row's values when it exists, else the built-in defaults. */
export async function configuredPageMetadata(
  restaurantId: string,
  pageSlug: FunctionalPageSlug,
  fallback: { title: string; description: string },
): Promise<Pick<Metadata, "title" | "description">> {
  const page: WebsitePage | null = await getPageContent(restaurantId, pageSlug);
  const seo = (page?.seo ?? {}) as Record<string, string | undefined>;
  return {
    title: seo.title ?? page?.title ?? fallback.title,
    description: seo.description ?? page?.description ?? fallback.description,
  };
}
