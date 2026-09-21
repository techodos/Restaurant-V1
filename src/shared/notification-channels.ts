import type { RestaurantFeatures } from "./contract/settings";

/**
 * Which customer-notification channels a restaurant has switched on, from its
 * `restaurants.features` JSON:
 *
 *   { "notifications": true, "notificationChannels": { "emailNotify": true, "pushNotify": true } }
 *
 * `notifications: false` turns everything off regardless of the channel flags.
 */
export interface NotificationChannelsEnabled {
  email: boolean;
  push: boolean;
}

export const ALL_CHANNELS_ON: NotificationChannelsEnabled = { email: true, push: true };

export function notificationChannelsEnabled(
  features: Pick<RestaurantFeatures, "notifications" | "notificationChannels">,
): NotificationChannelsEnabled {
  if (!features.notifications) return { email: false, push: false };
  return { email: features.notificationChannels.emailNotify, push: features.notificationChannels.pushNotify };
}
