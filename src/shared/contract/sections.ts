import { z } from "zod";
import { ORDER_TYPES } from "./enums";

/**
 * Website pages are stored as JSONB section arrays (website_pages.sections):
 *   [{ "type": "hero", "enabled": true, "title": "...", ... }]
 * Each section type has a tolerant schema: unknown fields are ignored, missing
 * fields fall back to defaults, and a section that fails to parse at all is
 * skipped by the renderer instead of breaking the page.
 */

const ctaSchema = z
  .object({
    label: z.string().trim().max(40).default("Order now"),
    href: z.string().trim().max(300).default("#menu"),
    style: z.enum(["primary", "outline", "ghost"]).default("primary"),
  })
  .default({});

const imageSchema = z.object({
  url: z.string().trim().min(1),
  alt: z.string().trim().max(200).default(""),
  caption: z.string().trim().max(200).optional(),
});

export const heroSectionSchema = z.object({
  type: z.literal("hero"),
  enabled: z.boolean().default(true),
  eyebrow: z.string().trim().max(80).optional(),
  title: z.string().trim().max(140).default(""),
  subtitle: z.string().trim().max(400).optional(),
  image: imageSchema.optional(),
  alignment: z.enum(["left", "center"]).default("left"),
  overlay: z.coerce.number().min(0).max(1).default(0.45),
  height: z.enum(["sm", "md", "lg", "full"]).default("lg"),
  primaryCta: ctaSchema.optional(),
  secondaryCta: ctaSchema.optional(),
  highlights: z.array(z.string().trim().max(60)).max(6).default([]),
});

export const announcementSectionSchema = z.object({
  type: z.literal("announcement"),
  enabled: z.boolean().default(true),
  text: z.string().trim().max(200).default(""),
  linkLabel: z.string().trim().max(40).optional(),
  linkHref: z.string().trim().max(300).optional(),
  tone: z.enum(["primary", "neutral", "accent"]).default("primary"),
});

export const featuredItemsSectionSchema = z.object({
  type: z.literal("featured_items"),
  enabled: z.boolean().default(true),
  title: z.string().trim().max(120).default("Guest favourites"),
  subtitle: z.string().trim().max(300).optional(),
  /** explicit item slugs; empty => whatever the restaurant marked as featured */
  itemSlugs: z.array(z.string().trim().max(120)).default([]),
  limit: z.coerce.number().int().min(1).max(12).default(6),
  layout: z.enum(["grid", "carousel"]).default("grid"),
  cta: ctaSchema.optional(),
});

export const menuCategoriesSectionSchema = z.object({
  type: z.literal("menu_categories"),
  enabled: z.boolean().default(true),
  title: z.string().trim().max(120).default("Explore the menu"),
  subtitle: z.string().trim().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(24).default(8),
  showImages: z.boolean().default(true),
});

export const menuPreviewSectionSchema = z.object({
  type: z.literal("menu_preview"),
  enabled: z.boolean().default(true),
  title: z.string().trim().max(120).default("Popular right now"),
  subtitle: z.string().trim().max(300).optional(),
  categorySlug: z.string().trim().max(120).optional(),
  itemSlugs: z.array(z.string().trim().max(120)).default([]),
  limit: z.coerce.number().int().min(1).max(12).default(4),
});

export const aboutSectionSchema = z.object({
  type: z.literal("about"),
  enabled: z.boolean().default(true),
  eyebrow: z.string().trim().max(60).optional(),
  title: z.string().trim().max(140).default("Our story"),
  body: z.string().trim().max(4000).default(""),
  image: imageSchema.optional(),
  imagePosition: z.enum(["left", "right"]).default("left"),
  stats: z
    .array(z.object({ value: z.string().trim().max(20), label: z.string().trim().max(40) }))
    .max(4)
    .default([]),
  cta: ctaSchema.optional(),
});

export const gallerySectionSchema = z.object({
  type: z.literal("gallery"),
  enabled: z.boolean().default(true),
  title: z.string().trim().max(120).default("From our kitchen"),
  subtitle: z.string().trim().max(300).optional(),
  images: z.array(imageSchema).max(24).default([]),
  columns: z.coerce.number().int().min(2).max(4).default(3),
});

export const whyChooseUsSectionSchema = z.object({
  type: z.literal("why_choose_us"),
  enabled: z.boolean().default(true),
  title: z.string().trim().max(120).default("Why guests choose us"),
  subtitle: z.string().trim().max(300).optional(),
  items: z
    .array(
      z.object({
        icon: z.string().trim().max(40).default("sparkles"),
        title: z.string().trim().max(80),
        description: z.string().trim().max(300).default(""),
      }),
    )
    .max(8)
    .default([]),
});

export const reviewsSectionSchema = z.object({
  type: z.literal("reviews"),
  enabled: z.boolean().default(true),
  title: z.string().trim().max(120).default("What our guests say"),
  subtitle: z.string().trim().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(12).default(6),
  layout: z.enum(["grid", "carousel"]).default("grid"),
  showCta: z.boolean().default(true),
});

export const reservationCtaSectionSchema = z.object({
  type: z.literal("reservation_cta"),
  enabled: z.boolean().default(true),
  title: z.string().trim().max(140).default("Reserve your table"),
  subtitle: z.string().trim().max(300).optional(),
  image: imageSchema.optional(),
  phoneLabel: z.string().trim().max(40).optional(),
  cta: ctaSchema.optional(),
});

export const locationsSectionSchema = z.object({
  type: z.literal("locations"),
  enabled: z.boolean().default(true),
  title: z.string().trim().max(120).default("Find us"),
  subtitle: z.string().trim().max(300).optional(),
  showMap: z.boolean().default(true),
  limit: z.coerce.number().int().min(1).max(20).default(6),
});

export const contactSectionSchema = z.object({
  type: z.literal("contact"),
  enabled: z.boolean().default(true),
  title: z.string().trim().max(120).default("Get in touch"),
  subtitle: z.string().trim().max(300).optional(),
  showForm: z.boolean().default(false),
  email: z.string().trim().max(160).optional(),
  phone: z.string().trim().max(40).optional(),
});

export const ctaSectionSchema = z.object({
  type: z.literal("cta"),
  enabled: z.boolean().default(true),
  title: z.string().trim().max(140).default(""),
  subtitle: z.string().trim().max(300).optional(),
  image: imageSchema.optional(),
  tone: z.enum(["primary", "neutral", "image"]).default("primary"),
  cta: ctaSchema.optional(),
  secondaryCta: ctaSchema.optional(),
});

export const richTextSectionSchema = z.object({
  type: z.literal("rich_text"),
  enabled: z.boolean().default(true),
  title: z.string().trim().max(140).optional(),
  body: z.string().trim().max(8000).default(""),
  width: z.enum(["narrow", "wide"]).default("narrow"),
});

export const orderTypeSwitchSectionSchema = z.object({
  type: z.literal("order_type_switch"),
  enabled: z.boolean().default(true),
  title: z.string().trim().max(120).default("How would you like your order?"),
  subtitle: z.string().trim().max(300).optional(),
  orderTypes: z.array(z.enum(ORDER_TYPES)).min(1).default(["delivery", "pickup"]),
});

export const sectionSchema = z.discriminatedUnion("type", [
  heroSectionSchema,
  announcementSectionSchema,
  featuredItemsSectionSchema,
  menuCategoriesSectionSchema,
  menuPreviewSectionSchema,
  aboutSectionSchema,
  gallerySectionSchema,
  whyChooseUsSectionSchema,
  reviewsSectionSchema,
  reservationCtaSectionSchema,
  locationsSectionSchema,
  contactSectionSchema,
  ctaSectionSchema,
  richTextSectionSchema,
  orderTypeSwitchSectionSchema,
]);

export type Section = z.infer<typeof sectionSchema>;
export type SectionType = Section["type"];
export type HeroSection = z.infer<typeof heroSectionSchema>;
export type AnnouncementSection = z.infer<typeof announcementSectionSchema>;
export type FeaturedItemsSection = z.infer<typeof featuredItemsSectionSchema>;
export type AboutSection = z.infer<typeof aboutSectionSchema>;
export type GallerySection = z.infer<typeof gallerySectionSchema>;
export type WhyChooseUsSection = z.infer<typeof whyChooseUsSectionSchema>;
export type ReviewsSection = z.infer<typeof reviewsSectionSchema>;
export type ReservationCtaSection = z.infer<typeof reservationCtaSectionSchema>;
export type LocationsSection = z.infer<typeof locationsSectionSchema>;
export type ContactSection = z.infer<typeof contactSectionSchema>;
export type CtaSection = z.infer<typeof ctaSectionSchema>;
export type RichTextSection = z.infer<typeof richTextSectionSchema>;
export type MenuPreviewSection = z.infer<typeof menuPreviewSectionSchema>;
export type MenuCategoriesSection = z.infer<typeof menuCategoriesSectionSchema>;
export type OrderTypeSwitchSection = z.infer<typeof orderTypeSwitchSectionSchema>;

export const SECTION_TYPES = [
  "hero", "announcement", "featured_items", "menu_categories", "menu_preview", "about",
  "gallery", "why_choose_us", "reviews", "reservation_cta", "locations", "contact",
  "cta", "rich_text", "order_type_switch",
] as const satisfies readonly SectionType[];

export const SECTION_LABELS: Record<SectionType, string> = {
  hero: "Hero",
  announcement: "Announcement",
  featured_items: "Featured items",
  menu_categories: "Menu categories",
  menu_preview: "Menu preview",
  about: "About / story",
  gallery: "Gallery",
  why_choose_us: "Why choose us",
  reviews: "Reviews",
  reservation_cta: "Reservation call-to-action",
  locations: "Locations & hours",
  contact: "Contact",
  cta: "Call-to-action banner",
  rich_text: "Rich text",
  order_type_switch: "Order type switch",
};

/**
 * Parse a raw JSONB section array. Invalid entries are dropped (never thrown)
 * so one bad admin edit cannot take down a whole storefront page.
 */
export function parseSections(raw: unknown): Section[] {
  if (!Array.isArray(raw)) return [];
  const sections: Section[] = [];
  for (const candidate of raw) {
    if (!candidate || typeof candidate !== "object") continue;
    const parsed = sectionSchema.safeParse(candidate);
    if (parsed.success) {
      if (parsed.data.enabled === false) continue;
      sections.push(parsed.data);
    }
  }
  return sections;
}

/** Parse a single section (used by the admin section editor). */
export function parseSection(raw: unknown): Section | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = sectionSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Default starter sections offered when a page has none configured. */
export function defaultSection(type: SectionType): Section {
  const parsed = sectionSchema.parse({ type });
  return parsed;
}
