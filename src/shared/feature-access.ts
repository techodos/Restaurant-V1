import { z } from "zod";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod } from "./contract/enums";
import { restaurantFeaturesSchema, type RestaurantFeatures } from "./contract/settings";

/**
 * Entitlements = what the PLATFORM allows a restaurant to use (restaurants.entitlements, edited only by a
 * super admin at /super-admin). `restaurants.features` stays the owner's own on/off switches. A feature is
 * effective only when both allow it: `resolveFeatures`, the one place that combines them, is applied at every
 * boundary a restaurant row is read (db/mappers.ts#mapRestaurant, the notification dispatcher, ...), so
 * storefront, checkout, notifications and the admin all see the same answer.
 *
 * Absent key = allowed, so a `{}` column (every existing restaurant) changes nothing. `alaCarteEnabled`
 * is a mode, not a capability ("off" means buffet-only), so it is not an entitlement.
 */

/** Features the super admin can switch off for a restaurant (also hides their Settings checkbox). */
export const FEATURE_ENTITLEMENTS = [
  "onlineOrdering", "delivery", "pickup", "dineIn", "reservations", "reviews", "coupons", "loyalty", "gallery",
  "customDomain", "analytics", "onlinePayments", "BranchingFeature", "notifications",
] as const satisfies readonly (keyof RestaurantFeatures)[];
/** Notification channel switches (restaurants.features.notificationChannels). */
export const CHANNEL_ENTITLEMENTS = ["emailNotify", "pushNotify"] as const;
/** Admin screens that have no feature switch of their own. */
export const PAGE_ENTITLEMENTS = ["kitchen", "customers", "payments", "locations", "staff"] as const;

/** Payment methods the owner may offer (each hides its checkbox in Settings > Payments and is refused at checkout). */
export type PaymentEntitlement = `pay_${PaymentMethod}`;
export const paymentEntitlement = (method: PaymentMethod): PaymentEntitlement => `pay_${method}`;
export const PAYMENT_ENTITLEMENTS: readonly PaymentEntitlement[] = PAYMENT_METHODS.map(paymentEntitlement);

/** Online gateways the owner may pick in Settings > Payments; a disallowed one acts as "none" (see effectiveOnlineProvider). */
export const ONLINE_PROVIDERS = ["stripe", "jazzcash"] as const;
export type OnlineProviderId = (typeof ONLINE_PROVIDERS)[number];
export const ONLINE_PROVIDER_LABELS: Record<OnlineProviderId, string> = { stripe: "Stripe", jazzcash: "JazzCash" };
export type ProviderEntitlement = `provider_${OnlineProviderId}`;
export const providerEntitlement = (provider: OnlineProviderId): ProviderEntitlement => `provider_${provider}`;
export const PROVIDER_ENTITLEMENTS: readonly ProviderEntitlement[] = ONLINE_PROVIDERS.map(providerEntitlement);

export const ENTITLEMENT_KEYS = [
  ...FEATURE_ENTITLEMENTS, ...CHANNEL_ENTITLEMENTS, ...PAGE_ENTITLEMENTS, ...PAYMENT_ENTITLEMENTS, ...PROVIDER_ENTITLEMENTS,
] as const;
export type EntitlementKey = (typeof ENTITLEMENT_KEYS)[number];

export const ENTITLEMENT_LABELS: Record<EntitlementKey, string> = {
  onlineOrdering: "Online ordering", delivery: "Delivery", pickup: "Pickup", dineIn: "Dine-in",
  reservations: "Reservations", reviews: "Reviews", coupons: "Coupons", loyalty: "Loyalty", gallery: "Gallery",
  customDomain: "Custom domain", analytics: "Sales reports & analytics", onlinePayments: "Online payments",
  BranchingFeature: "Multi-branch ordering", notifications: "Notifications",
  emailNotify: "Email notifications", pushNotify: "Push notifications",
  kitchen: "Kitchen screen", customers: "Customers screen", payments: "Payments screen",
  locations: "Locations screen", staff: "Staff screen",
  ...(Object.fromEntries(PAYMENT_METHODS.map((m) => [paymentEntitlement(m), PAYMENT_METHOD_LABELS[m]])) as Record<PaymentEntitlement, string>),
  ...(Object.fromEntries(ONLINE_PROVIDERS.map((p) => [providerEntitlement(p), ONLINE_PROVIDER_LABELS[p]])) as Record<ProviderEntitlement, string>),
};

const allowed = () => z.boolean().catch(true).default(true);
export const restaurantEntitlementsSchema = z.object(
  Object.fromEntries(ENTITLEMENT_KEYS.map((key) => [key, allowed()])) as Record<EntitlementKey, ReturnType<typeof allowed>>,
);
export type RestaurantEntitlements = z.infer<typeof restaurantEntitlementsSchema>;

export function parseEntitlements(raw: unknown): RestaurantEntitlements {
  return restaurantEntitlementsSchema.parse(raw !== null && typeof raw === "object" && !Array.isArray(raw) ? raw : {});
}

/** The owner's features with everything the platform has switched off forced to off. */
export function applyEntitlements(features: RestaurantFeatures, entitlements: RestaurantEntitlements): RestaurantFeatures {
  const effective: RestaurantFeatures = {
    ...features,
    notificationChannels: {
      emailNotify: features.notificationChannels.emailNotify && entitlements.emailNotify,
      pushNotify: features.notificationChannels.pushNotify && entitlements.pushNotify,
    },
  };
  for (const key of FEATURE_ENTITLEMENTS) if (!entitlements[key]) effective[key] = false;
  return effective;
}

/** `restaurants.features` + `restaurants.entitlements` (both untrusted JSONB) -> owner's, platform's and effective. */
export function resolveFeatures(rawFeatures: unknown, rawEntitlements: unknown) {
  const ownerFeatures = restaurantFeaturesSchema.parse(rawFeatures ?? {});
  const entitlements = parseEntitlements(rawEntitlements);
  return { ownerFeatures, entitlements, features: applyEntitlements(ownerFeatures, entitlements) };
}

/** The given methods minus the ones the platform has not allowed this restaurant to offer. */
export function entitledPaymentMethods(methods: readonly PaymentMethod[], entitlements: RestaurantEntitlements): PaymentMethod[] {
  return methods.filter((method) => entitlements[paymentEntitlement(method)]);
}

/** The owner's chosen gateway, or "none" when the platform has not allowed it (checkout and order placement read this). */
export function effectiveOnlineProvider(
  provider: OnlineProviderId | "none",
  entitlements: RestaurantEntitlements,
): OnlineProviderId | "none" {
  return provider !== "none" && entitlements[providerEntitlement(provider)] ? provider : "none";
}

/**
 * The entitlement behind a permission: its prefix when that is an entitlement key (`coupons.view`, `kitchen.view`,
 * `staff.manage`, ...), else none (orders, menu, settings, ... are always available). Lets the one guard in
 * web/session.ts and the sidebar gate every screen and action without a table per page.
 */
export function entitlementForPermission(permission: string): EntitlementKey | undefined {
  const prefix = permission.split(".")[0] ?? "";
  return (ENTITLEMENT_KEYS as readonly string[]).includes(prefix) ? (prefix as EntitlementKey) : undefined;
}

/** Admin page/nav key -> the entitlement that must be on for the owner to see it. */
export function isEntitled(entitlements: RestaurantEntitlements, key: string | undefined): boolean {
  return key === undefined || (entitlements as Record<string, boolean>)[key] !== false; // not an entitlement (e.g. alaCarteEnabled) = allowed
}
