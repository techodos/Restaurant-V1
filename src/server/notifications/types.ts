import type { Order, Reservation } from "@/shared/contract/models";
import type { NotificationChannelsEnabled } from "@/shared/notification-channels";

/**
 * Provider contracts. The notification service only ever talks to these
 * interfaces, so Resend or FCM can be replaced (SES, OneSignal, …) by writing
 * one file in `server/integrations/` and changing the factory.
 */

export interface EmailMessage {
  to: string;
  /** shown as the sender name; the address itself comes from configuration */
  fromName: string;
  replyTo?: string | null;
  subject: string;
  html: string;
  text: string;
  /** provider-side de-duplication: the same key is never delivered twice */
  idempotencyKey: string;
}

export type EmailResult =
  | { ok: true; id: string | null }
  | { ok: false; retryable: boolean; error: string };

export interface EmailProvider {
  readonly name: string;
  send(message: EmailMessage): Promise<EmailResult>;
}

export interface PushMessage {
  title: string;
  body: string;
  /** string values only (FCM requirement) */
  data: Record<string, string>;
  /** absolute URL opened when the notification is tapped */
  link: string;
  /** same key = the device shows one notification, so a rare re-send replaces instead of duplicating */
  dedupeKey?: string;
}

export type PushOutcome =
  | { token: string; ok: true }
  /** `invalidToken`: the token is permanently dead and must be deactivated */
  | { token: string; ok: false; invalidToken: boolean; retryable: boolean; error: string };

export interface PushProvider {
  readonly name: string;
  send(tokens: readonly string[], message: PushMessage): Promise<PushOutcome[]>;
}

/** What the dispatcher works on: one committed order or reservation event (exactly one of the two ids is set). */
export interface NotificationEventRecord {
  id: string;
  restaurantId: string;
  orderId: string | null;
  /** set for reservation events ("requested" / "confirmed"); email only */
  reservationId?: string | null;
  customerId: string | null;
  /** "placed" or an order status; "requested" / "confirmed" for a reservation */
  eventType: string;
  attempts: number;
  emailState: ChannelState | null;
  pushState: ChannelState | null;
}

export type ChannelState = "sent" | "skipped" | "failed";

/** Restaurant branding + switches shared by every notification, loaded under the event's own restaurant id. */
export interface NotificationRestaurant {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string | null;
  email: string | null;
  phone: string | null;
  currencySymbol: string;
  locale: string;
  timezone: string;
  reviewsEnabled: boolean;
  /** the restaurant's own switches (features.notifications / emailNotify / pushNotify) */
  channels: NotificationChannelsEnabled;
}

/** Everything needed to render a notification, loaded under the event's own restaurant id. */
export interface NotificationOrderContext {
  restaurant: NotificationRestaurant;
  /** with items */
  order: Order;
}

export interface NotificationReservationContext {
  restaurant: NotificationRestaurant;
  reservation: Reservation;
}
