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

/**
 * An admin-edited list that must never take the section down: entries that fail `item` (a blank row the
 * editor just added, an image with no address) are dropped one by one and anything past `max` is cut,
 * instead of one bad entry discarding the whole list.
 */
function lenientList<T extends z.ZodTypeAny>(item: T, max: number) {
  return z.preprocess(
    (raw) =>
      Array.isArray(raw)
        ? raw
            .map((entry) => item.safeParse(entry))
            .filter((result) => result.success)
            .map((result) => result.data)
            .slice(0, max)
        : [],
    z.array(item),
  );
}

export const heroSectionSchema = z.object({
  type: z.literal("hero"),
  enabled: z.boolean().default(true),
  eyebrow: z.string().trim().max(80).optional(),
  title: z.string().trim().max(140).default(""),
  subtitle: z.string().trim().max(400).optional(),
  image: imageSchema.optional(),
  /** "cinematic" (default): full-bleed photo under a dark scrim, as today. "split": a light ground, text on one
   * side and a floating cutout photo on the other — needs `cutoutImage` (a transparent-background product
   * shot), not the regular background photo, to look right. */
  layout: z.enum(["cinematic", "split", "framed", "collage", "dishes"]).catch("cinematic").default("cinematic"),
  cutoutImage: imageSchema.optional(),
  /** "collage" layout: up to three more photos beside the main `image` (none = the main photo alone) */
  galleryImages: lenientList(imageSchema, 3),
  /** "dishes" layout: up to three dish slugs; empty = the dishes the restaurant marked as featured */
  dishSlugs: lenientList(z.string().trim().min(1).max(120), 3),
  alignment: z.enum(["left", "center"]).default("left"),
  overlay: z.coerce.number().min(0).max(1).default(0.45),
  height: z.enum(["sm", "md", "lg", "full"]).default("lg"),
  primaryCta: ctaSchema.optional(),
  secondaryCta: ctaSchema.optional(),
  highlights: z.array(z.string().trim().max(60)).max(6).default([]),
  /**
   * 3D template only (TEMPLATE_ID=2): a .glb / .gltf model shown in the hero instead of the built-in burger.
   * An https URL (CORS-enabled) or a site path such as /images/<slug>/burger.glb. Ignored by other templates;
   * a malformed value is dropped rather than discarding the whole hero.
   */
  modelUrl: z.string().trim().max(600).optional().catch(undefined),
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

export const ORDER_SWITCH_LAYOUTS = ["band", "cards", "photo", "capsule", "split", "float"] as const;
export type OrderSwitchLayout = (typeof ORDER_SWITCH_LAYOUTS)[number];
/** each layout's own ground when the section's `tone` is "auto" */
export const ORDER_SWITCH_TONE: Record<OrderSwitchLayout, "night" | "paper" | "muted"> = {
  band: "night",
  cards: "paper",
  photo: "night",
  capsule: "muted",
  split: "night",
  float: "muted",
};

export const orderTypeSwitchSectionSchema = z.object({
  type: z.literal("order_type_switch"),
  enabled: z.boolean().default(true),
  title: z.string().trim().max(120).default("How would you like your order?"),
  subtitle: z.string().trim().max(300).optional(),
  orderTypes: z.array(z.enum(ORDER_TYPES)).min(1).default(["delivery", "pickup"]),
  /** "band" (default) = the dark strip of three doors; the rest are presentation-only variants */
  layout: z.enum(ORDER_SWITCH_LAYOUTS).catch("band").default("band"),
  /** "auto" = the layout's own ground (ORDER_SWITCH_TONE); "night" / "paper" force dark / light */
  tone: z.enum(["auto", "night", "paper"]).catch("auto").default("auto"),
  showEta: z.boolean().catch(true).default(true),
  /** the visible title + subtitle in every layout but "band" (which keeps the title for screen readers only) */
  showHeading: z.boolean().catch(true).default(true),
  /** per-door line under the label; empty = the built-in one */
  deliveryText: z.string().trim().max(140).optional().catch(undefined),
  pickupText: z.string().trim().max(140).optional().catch(undefined),
  dineInText: z.string().trim().max(140).optional().catch(undefined),
  /** "photo" layout only; a door with no photo falls back to the cover photo */
  deliveryImage: imageSchema.optional().catch(undefined),
  pickupImage: imageSchema.optional().catch(undefined),
  dineInImage: imageSchema.optional().catch(undefined),
});

/** A full-bleed photo band: a scroll/explore action, a short caption and a row of admin-entered numbers
 * (not computed from real data — the restaurant types them in, same as `about.stats`). */
export const statsBandSectionSchema = z.object({
  type: z.literal("stats_band"),
  enabled: z.boolean().default(true),
  image: imageSchema.optional(),
  caption: z.string().trim().max(300).optional(),
  exploreCta: ctaSchema.optional(),
  stats: z
    .array(z.object({ value: z.string().trim().max(20), label: z.string().trim().max(40) }))
    .max(4)
    .default([]),
});

/**
 * Menu page banner height on phones. "original" = the whole upload at its own proportions (no crop); the rest
 * are fixed frames, centred, so a wide banner gives up only its side edges. Desktop is never cropped.
 */
export const MOBILE_BANNER_HEIGHTS = ["original", "short", "medium", "tall", "extra-tall"] as const;
export type MobileBannerHeight = (typeof MOBILE_BANNER_HEIGHTS)[number];
export const MOBILE_BANNER_LABELS: Record<MobileBannerHeight, string> = {
  original: "Original — the whole photo, no cropping",
  short: "Short — 3 : 1",
  medium: "Medium — 2.6 : 1 (default)",
  tall: "Tall — 2.2 : 1",
  "extra-tall": "Extra tall — 1.8 : 1",
};

/**
 * Marks where a functional page's built-in body (the menu list, the booking form, the reviews list, the
 * location cards) sits among the other sections of its website page. `title` / `subtitle` override the body's
 * own heading; when the marker is absent (or disabled) the body renders after every other section.
 */
export const pageContentSectionSchema = z.object({
  type: z.literal("page_content"),
  enabled: z.boolean().default(true),
  title: z.string().trim().max(140).optional(),
  subtitle: z.string().trim().max(400).optional(),
  /** menu page only: the search box placeholder (none = empty) */
  searchPlaceholder: z.string().trim().max(80).optional(),
  /** menu page only: how tall the photo banner is on PHONES (tablet/desktop always show the whole photo) */
  mobileBannerHeight: z.enum(MOBILE_BANNER_HEIGHTS).catch("medium").default("medium"),
  /** menu page only: strength of the hero photo's night gradient, 0 - 1 (absent = none) */
  photoDarkening: z.coerce.number().min(0).max(1).optional().catch(undefined),
  /** the body's own hero photo (menu, reviews, locations, reservation); absent => the restaurant's cover photo */
  image: imageSchema.optional(),
  /**
   * Menu page only: "editorial" (default) = alternating photo/rows and dark/light chapters; "grid" = every
   * category a light card grid with the stepper + Add to Cart bar. Ignored on the other pages.
   */
  menuLayout: z.enum(["editorial", "grid", "list", "sidebar", "rows", "cards"]).catch("editorial").default("editorial"),
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
  statsBandSectionSchema,
  pageContentSectionSchema,
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
export type StatsBandSection = z.infer<typeof statsBandSectionSchema>;
export type PageContentSection = z.infer<typeof pageContentSectionSchema>;

export const SECTION_TYPES = [
  "hero", "announcement", "featured_items", "menu_categories", "menu_preview", "about",
  "gallery", "why_choose_us", "reviews", "reservation_cta", "locations", "contact",
  "cta", "rich_text", "order_type_switch", "stats_band", "page_content",
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
  stats_band: "Photo band with numbers",
  page_content: "Page content (menu, booking form, reviews, locations)",
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
