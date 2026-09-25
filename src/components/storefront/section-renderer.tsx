import type { Section } from "@/shared/contract/sections";
import { parseSections } from "@/shared/contract/sections";
import { AnnouncementSection } from "@/components/storefront/sections/announcement-section";
import { AboutSection } from "@/components/storefront/sections/about-section";
import { ContactSection } from "@/components/storefront/sections/contact-section";
import { CtaSection } from "@/components/storefront/sections/cta-section";
import { FeaturedItemsSection } from "@/components/storefront/sections/featured-items-section";
import { GallerySection } from "@/components/storefront/sections/gallery-section";
import { HeroSection } from "@/components/storefront/sections/hero-section";
import { LocationsSection } from "@/components/storefront/sections/locations-section";
import { MenuCategoriesSection } from "@/components/storefront/sections/menu-categories-section";
import { MenuPreviewSection } from "@/components/storefront/sections/menu-preview-section";
import { OrderTypeSwitchSection } from "@/components/storefront/sections/order-type-switch-section";
import { ReservationCtaSection } from "@/components/storefront/sections/reservation-cta-section";
import { ReviewsSection } from "@/components/storefront/sections/reviews-section";
import { RichTextSection } from "@/components/storefront/sections/rich-text-section";
import { WhyChooseUsSection } from "@/components/storefront/sections/why-choose-us-section";
import type { StorefrontContext } from "@/shared/contract/models";

/**
 * Website pages are stored as `sections` JSONB. This is the only place that
 * turns those rows into UI:
 *  - parsing is defensive (unknown types and malformed config are dropped,
 *    never thrown), so a bad edit made in the admin UI cannot break the site;
 *  - sections rendered here are Server Components that read their own data,
 *    so the page pays only for the sections it actually has.
 */

const RENDERERS: Record<Section["type"], (props: { section: never; context: StorefrontContext }) => React.ReactNode> = {
  hero: HeroSection as never,
  announcement: AnnouncementSection as never,
  featured_items: FeaturedItemsSection as never,
  menu_categories: MenuCategoriesSection as never,
  menu_preview: MenuPreviewSection as never,
  about: AboutSection as never,
  gallery: GallerySection as never,
  why_choose_us: WhyChooseUsSection as never,
  reviews: ReviewsSection as never,
  reservation_cta: ReservationCtaSection as never,
  locations: LocationsSection as never,
  contact: ContactSection as never,
  cta: CtaSection as never,
  rich_text: RichTextSection as never,
  order_type_switch: OrderTypeSwitchSection as never,
  page_content: (() => null) as never, // replaced by the page's `body` in SectionRenderer
};

export interface SectionRendererProps {
  context: StorefrontContext;
  /** raw JSONB from website_pages.sections */
  sections: unknown;
  /** section types to render; defaults to every section present */
  only?: Section["type"][];
  skip?: Section["type"][];
  /** the page's built-in body; rendered where a `page_content` section sits, else after the sections */
  body?: React.ReactNode;
}

export function SectionRenderer({ context, sections, only, skip, body }: SectionRendererProps) {
  const parsed = parseSections(sections);
  const visible = parsed.filter((section) => {
    if (!section.enabled) return false;
    if (only && !only.includes(section.type)) return false;
    if (skip && skip.includes(section.type)) return false;
    return true;
  });

  return (
    <>
      {visible.map((section, index) => {
        if (section.type === "page_content") return <div key={`body-${index}`}>{body}</div>;
        const Renderer = RENDERERS[section.type];
        if (!Renderer) return null;
        return (
          <div
            key={`${section.type}-${index}`}
            className={index === 0 ? "animate-rise" : "reveal"}
            data-after={visible[index - 1]?.type}
          >
            <Renderer section={section as never} context={context} />
          </div>
        );
      })}
      {body && !visible.some((section) => section.type === "page_content") ? body : null}
    </>
  );
}
