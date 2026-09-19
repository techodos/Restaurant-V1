import { z } from "zod";
import { ORDER_TYPES, PAYMENT_METHODS } from "./enums";

/**
 * restaurants.settings / restaurants.features / websites.config are JSONB and
 * therefore untrusted. Everything read from them is parsed defensively with a
 * fallback so malformed configuration can never break a page.
 */

export const restaurantSettingsSchema = z.object({
  tax: z
    .object({
      enabled: z.boolean().default(true),
      /** percentage, e.g. 5 = 5% */
      rate: z.coerce.number().min(0).max(50).default(0),
      /** true => prices already include tax (tax is extracted, not added) */
      included: z.boolean().default(false),
      applyOnDeliveryFee: z.boolean().default(false),
      label: z.string().trim().max(40).default("Sales tax"),
      /** optional per-restaurant tax registration number shown on receipts */
      registrationNumber: z.string().trim().max(60).optional(),
    })
    .default({}),
  serviceFee: z
    .object({
      enabled: z.boolean().default(false),
      rate: z.coerce.number().min(0).max(50).default(0),
      orderTypes: z.array(z.enum(ORDER_TYPES)).default(["dine_in"]),
    })
    .default({}),
  ordering: z
    .object({
      onlineOrderingEnabled: z.boolean().default(true),
      minimumOrderAmount: z.coerce.number().min(0).default(0),
      maxAdvanceDays: z.coerce.number().int().min(0).max(30).default(7),
      allowScheduledOrders: z.boolean().default(true),
      preparationTimeMinutes: z.coerce.number().int().min(0).max(240).default(20),
      packagingCharge: z.coerce.number().min(0).default(0),
      requirePhoneVerification: z.boolean().default(false),
    })
    .default({}),
  payments: z
    .object({
      enabledMethods: z.array(z.enum(PAYMENT_METHODS)).default(["cash_on_delivery", "cash"]),
      /** providers configured server-side; keys never reach the browser */
      onlineProvider: z.enum(["none", "stripe"]).default("none"),
      payAtStoreEnabled: z.boolean().default(true),
    })
    .default({}),
  reservations: z
    .object({
      enabled: z.boolean().default(true),
      slotMinutes: z.coerce.number().int().min(15).max(120).default(30),
      minGuests: z.coerce.number().int().min(1).max(20).default(1),
      maxGuests: z.coerce.number().int().min(1).max(60).default(12),
      autoConfirm: z.boolean().default(false),
      maxAdvanceDays: z.coerce.number().int().min(1).max(90).default(30),
      defaultDurationMinutes: z.coerce.number().int().min(30).max(300).default(90),
      /** optional table inventory; when empty, table assignment is free text */
      tables: z
        .array(
          z.object({
            name: z.string().trim().min(1).max(40),
            seats: z.coerce.number().int().min(1).max(30),
            minGuests: z.coerce.number().int().min(1).max(30).optional(),
          }),
        )
        .default([]),
    })
    .default({}),
  delivery: z
    .object({
      enabled: z.boolean().default(true),
      defaultEtaMinutes: z.coerce.number().int().min(5).max(240).default(40),
      freeDeliveryOver: z.coerce.number().min(0).nullable().default(null),
      /** driver assignment is manual in V1; live GPS can be appended later */
      trackingEnabled: z.boolean().default(true),
    })
    .default({}),
  loyalty: z
    .object({
      enabled: z.boolean().default(false),
      pointsPerCurrencyUnit: z.coerce.number().min(0).default(1),
      redeemRate: z.coerce.number().min(0).default(0.01),
    })
    .default({}),
  receipt: z
    .object({
      footerNote: z.string().trim().max(400).optional(),
      showTaxNumber: z.boolean().default(false),
    })
    .default({}),
});

export type RestaurantSettings = z.infer<typeof restaurantSettingsSchema>;
export type RestaurantSettingsInput = z.input<typeof restaurantSettingsSchema>;

export const restaurantFeaturesSchema = z.object({
  onlineOrdering: z.boolean().default(true),
  delivery: z.boolean().default(true),
  pickup: z.boolean().default(true),
  dineIn: z.boolean().default(false),
  reservations: z.boolean().default(true),
  reviews: z.boolean().default(true),
  coupons: z.boolean().default(true),
  loyalty: z.boolean().default(false),
  gallery: z.boolean().default(true),
  /** platform-level switches the future Super Admin can flip per restaurant */
  customDomain: z.boolean().default(false),
  analytics: z.boolean().default(true),
  onlinePayments: z.boolean().default(false),
});

export type RestaurantFeatures = z.infer<typeof restaurantFeaturesSchema>;
export type RestaurantFeaturesInput = z.input<typeof restaurantFeaturesSchema>;

export const themeSchema = z.object({
  name: z.string().trim().max(60).default("House"),
  primary: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#C8102E"),
  primaryForeground: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#FFFFFF"),
  secondary: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#1F2933"),
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#E8B04B"),
  background: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#FFF8F0"),
  surface: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#FFFFFF"),
  foreground: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#1A1A1A"),
  muted: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#6B7280"),
  border: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#E7E1D8"),
  font: z.string().trim().max(60).default("Playfair Display"),
  bodyFont: z.string().trim().max(60).default("Inter"),
  radius: z.enum(["none", "sm", "md", "lg", "xl", "full"]).default("md"),
  dark: z.boolean().default(false),
});

export type RestaurantTheme = z.infer<typeof themeSchema>;

export const websiteConfigSchema = z.object({
  announcement: z
    .object({
      enabled: z.boolean().default(false),
      text: z.string().trim().max(160).default(""),
      linkLabel: z.string().trim().max(40).optional(),
      linkHref: z.string().trim().max(300).optional(),
    })
    .default({}),
  navigation: z
    .object({
      items: z
        .array(z.object({ label: z.string().trim().max(40), href: z.string().trim().max(300) }))
        .default([]),
      showCart: z.boolean().default(true),
      sticky: z.boolean().default(true),
    })
    .default({}),
  footer: z
    .object({
      tagline: z.string().trim().max(200).optional(),
      columns: z
        .array(
          z.object({
            title: z.string().trim().max(40),
            links: z.array(z.object({ label: z.string().trim().max(60), href: z.string().trim().max(300) })).default([]),
          }),
        )
        .default([]),
      legalNote: z.string().trim().max(200).optional(),
    })
    .default({}),
  ordering: z
    .object({
      defaultOrderType: z.enum(ORDER_TYPES).default("delivery"),
      allowGuestCheckout: z.boolean().default(true),
      showPrepTime: z.boolean().default(true),
      ctaLabel: z.string().trim().max(40).default("Order now"),
    })
    .default({}),
  contact: z
    .object({
      email: z.string().trim().max(160).optional(),
      showWhatsapp: z.boolean().default(true),
      mapEmbedUrl: z.string().trim().max(600).optional(),
    })
    .default({}),
  social: z
    .object({
      instagram: z.string().trim().max(200).optional(),
      facebook: z.string().trim().max(200).optional(),
      tiktok: z.string().trim().max(200).optional(),
      x: z.string().trim().max(200).optional(),
    })
    .default({}),
});

export type WebsiteConfig = z.infer<typeof websiteConfigSchema>;
export type WebsiteConfigInput = z.input<typeof websiteConfigSchema>;
