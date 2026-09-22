import { restaurantFeaturesSchema, restaurantSettingsSchema } from "@/shared/contract/settings";

/**
 * Admin edit schemas. No field lists are duplicated here — every schema is
 * derived from the single source of truth in shared/contract/settings.ts
 * (the same schemas that parse restaurants.features/settings everywhere else),
 * just made partial so a section save can send only the fields it changed.
 */

export const updateFeaturesSchema = restaurantFeaturesSchema.partial();

const settingsShape = restaurantSettingsSchema.shape;

export const updateTaxSchema = settingsShape.tax.removeDefault().partial();
export const updateServiceFeeSchema = settingsShape.serviceFee.removeDefault().partial();
export const updateOrderingSchema = settingsShape.ordering.removeDefault().partial();
export const updatePaymentsSettingsSchema = settingsShape.payments.removeDefault().partial();
export const updateReservationsSettingsSchema = settingsShape.reservations.removeDefault().partial().omit({ tables: true });
export const updateDeliverySettingsSchema = settingsShape.delivery.removeDefault().partial();
export const updateLoyaltySchema = settingsShape.loyalty.removeDefault().partial();
export const updateReceiptSchema = settingsShape.receipt.removeDefault().partial();

export const SETTINGS_SECTION_SCHEMAS = {
  tax: updateTaxSchema,
  serviceFee: updateServiceFeeSchema,
  ordering: updateOrderingSchema,
  payments: updatePaymentsSettingsSchema,
  reservations: updateReservationsSettingsSchema,
  delivery: updateDeliverySettingsSchema,
  loyalty: updateLoyaltySchema,
  receipt: updateReceiptSchema,
} as const;

export type SettingsSection = keyof typeof SETTINGS_SECTION_SCHEMAS;
