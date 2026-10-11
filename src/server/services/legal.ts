import type { Restaurant, RestaurantLocation } from "@/shared/contract/models";
import { buildLegalDocument, legalFactsFor, type LegalDocument, type LegalKind } from "@/shared/legal";
import { notificationChannelsEnabled } from "@/shared/notification-channels";
import { ONLINE_PROVIDER_LABELS, effectiveOnlineProvider } from "@/shared/feature-access";
import { config } from "@/server/config";
import { getCheckoutOptions } from "./checkout";
import { googleAuthAvailable } from "./customer-auth";
import { getPushClientConfigFor } from "./notifications";

export interface LegalSource {
  restaurant: Restaurant;
  primaryLocation: RestaurantLocation | null;
  /** websites.config.contact.email; wins over restaurants.email, like the footer */
  contactEmail: string | null | undefined;
}

/**
 * The default Privacy Policy / Terms of Service for ONE restaurant: its own details plus what this
 * deployment really does for it (the payment methods checkout offers, whether push, Google sign-in and maps
 * are configured), so the documents never promise or disclose more than the storefront actually does.
 * No database read. The storefront passes its snapshot context; the super admin's "Customize" passes the
 * rows it read, so the starting text is exactly what the storefront shows.
 */
export function getLegalDocument(kind: LegalKind, source: LegalSource): LegalDocument {
  const { restaurant } = source;
  const checkout = getCheckoutOptions(restaurant);
  const provider = effectiveOnlineProvider(restaurant.settings.payments.onlineProvider, restaurant.entitlements);
  const paysOnline = checkout.paymentMethods.some((method) => method === "card_online" || method === "wallet");

  return buildLegalDocument(
    kind,
    legalFactsFor({
      restaurant,
      primaryLocation: source.primaryLocation,
      contactEmail: source.contactEmail,
      orderTypes: checkout.orderTypes,
      paymentMethods: checkout.paymentMethods,
      onlineProvider: paysOnline && provider !== "none" ? ONLINE_PROVIDER_LABELS[provider] : null,
      emailNotifications: notificationChannelsEnabled(restaurant.features).email,
      pushNotifications: getPushClientConfigFor(restaurant) !== null,
      googleSignIn: googleAuthAvailable(),
      maps: config.maps !== null,
    }),
  );
}
