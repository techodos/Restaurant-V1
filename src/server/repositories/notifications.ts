import { restaurantFeaturesSchema } from "@/shared/contract/settings";
import { ALL_CHANNELS_ON, notificationChannelsEnabled } from "@/shared/notification-channels";
import { getDb, type TenantScope } from "@/server/db/registry";
import { mapOrder, mapReservation, str, strOrNull, type Row } from "@/server/db/mappers";
import type { RequestContext } from "@/server/context";
import type {
  ChannelState,
  NotificationEventRecord,
  NotificationOrderContext,
  NotificationReservationContext,
  NotificationRestaurant,
} from "@/server/notifications/types";
import { getOrderItems } from "./orders";

/**
 * Notification persistence. Everything here runs on the privileged (service)
 * connection because the tables are server-only and the dispatcher acts for the
 * platform, not for a visitor. Every read that feeds a message is pinned to the
 * event's own restaurant id, so one restaurant's data can never end up in
 * another restaurant's notification.
 */

const SYSTEM: RequestContext = { actor: "notifications" };

function mapEvent(row: Row): NotificationEventRecord {
  return {
    id: str(row.id),
    restaurantId: str(row.restaurant_id),
    orderId: strOrNull(row.order_id),
    reservationId: strOrNull(row.reservation_id),
    customerId: strOrNull(row.customer_id),
    eventType: str(row.event_type),
    attempts: Number(row.attempts ?? 0),
    emailState: strOrNull(row.email_state) as ChannelState | null,
    pushState: strOrNull(row.push_state) as ChannelState | null,
  };
}

/**
 * Atomically claims due events (`for update skip locked`, so two dispatchers
 * never take the same row) and retires events that waited longer than
 * `maxAgeHours` — a "your order is being prepared" push three days late is worse
 * than none. Rows stuck in `processing` (crashed worker) become claimable again
 * once their lock expires.
 */
export async function claimDueNotificationEvents(
  options: { limit: number; maxAgeHours: number; restaurantId?: string | null },
  scope: TenantScope = {},
): Promise<NotificationEventRecord[]> {
  const db = getDb(scope);
  const rows = await db.write(SYSTEM, (tx) =>
    tx.query<Row>(
      `with expired as (
         update notification_events
            set status = 'dead', last_error = 'expired before delivery', processed_at = now(), locked_until = null
          where status in ('pending', 'processing')
            and created_at < now() - make_interval(hours => $2::int)
            and ($3::uuid is null or restaurant_id = $3::uuid)
          returning id
       ), due as (
         select id from notification_events
          where ((status = 'pending' and next_attempt_at <= now()) or (status = 'processing' and locked_until < now()))
            and created_at >= now() - make_interval(hours => $2::int)
            and ($3::uuid is null or restaurant_id = $3::uuid)
          order by created_at
          limit $1
          for update skip locked
       )
       update notification_events e
          set status = 'processing', attempts = e.attempts + 1, locked_until = now() + interval '5 minutes'
         from due
        where e.id = due.id
        returning e.*`,
      [options.limit, options.maxAgeHours, options.restaurantId ?? null],
    ),
  );
  return rows.map(mapEvent);
}

/** Restaurant branding + notification switches from a row that carries the `restaurant_*` aliases. */
function mapNotificationRestaurant(row: Row, restaurantId: string): NotificationRestaurant {
  const features = restaurantFeaturesSchema.safeParse(row.restaurant_features ?? {});
  return {
    id: restaurantId,
    name: str(row.restaurant_name),
    slug: str(row.restaurant_slug),
    logoUrl: strOrNull(row.restaurant_logo_url),
    primaryColor: strOrNull(row.restaurant_primary_color),
    email: strOrNull(row.restaurant_email),
    phone: strOrNull(row.restaurant_phone),
    currencySymbol: str(row.restaurant_currency_symbol) || "$",
    locale: str(row.restaurant_locale) || "en",
    timezone: str(row.restaurant_timezone) || "UTC",
    reviewsEnabled: features.success ? features.data.reviews : true,
    channels: features.success ? notificationChannelsEnabled(features.data) : ALL_CHANNELS_ON,
  };
}

const RESTAURANT_COLUMNS = `r.name as restaurant_name, r.slug as restaurant_slug, r.logo_url as restaurant_logo_url,
              r.primary_color as restaurant_primary_color, r.email as restaurant_email,
              r.phone as restaurant_phone, r.currency_symbol as restaurant_currency_symbol,
              r.locale as restaurant_locale, r.timezone as restaurant_timezone, r.features as restaurant_features`;

/** The order plus restaurant branding for one event, or null when the ids do not belong together. */
export async function loadNotificationOrderContext(
  event: NotificationEventRecord,
): Promise<NotificationOrderContext | null> {
  if (!event.orderId) return null;
  const db = getDb({ restaurantId: event.restaurantId });
  return db.write({ ...SYSTEM, restaurantId: event.restaurantId }, async (tx) => {
    const row = await tx.queryOne<Row>(
      `select o.*, l.name as location_name, dz.name as delivery_zone_name,
              ${RESTAURANT_COLUMNS}
         from orders o
         join restaurants r on r.id = o.restaurant_id
         left join restaurant1s l on l.id = o.location_id
         left join delivery_zones dz on dz.id = o.delivery_zone_id
        where o.id = $1 and o.restaurant_id = $2`,
      [event.orderId, event.restaurantId],
    );
    if (!row) return null;

    const order = mapOrder(row);
    order.items = await getOrderItems(tx, order.id);
    return { restaurant: mapNotificationRestaurant(row, event.restaurantId), order };
  });
}

/** The reservation plus restaurant branding for one event, or null when the ids do not belong together. */
export async function loadNotificationReservationContext(
  event: NotificationEventRecord,
): Promise<NotificationReservationContext | null> {
  if (!event.reservationId) return null;
  const db = getDb({ restaurantId: event.restaurantId });
  return db.write({ ...SYSTEM, restaurantId: event.restaurantId }, async (tx) => {
    const row = await tx.queryOne<Row>(
      `select v.*, l.name as location_name, ${RESTAURANT_COLUMNS}
         from reservations v
         join restaurants r on r.id = v.restaurant_id
         left join restaurant1s l on l.id = v.location_id
        where v.id = $1 and v.restaurant_id = $2`,
      [event.reservationId, event.restaurantId],
    );
    if (!row) return null;
    return { restaurant: mapNotificationRestaurant(row, event.restaurantId), reservation: mapReservation(row) };
  });
}
export interface EventOutcome {
  status: "pending" | "done" | "dead";
  emailState: ChannelState | null;
  pushState: ChannelState | null;
  lastError: string | null;
  /** when status is "pending": the retry time */
  nextAttemptAt?: Date;
}

export async function saveNotificationOutcome(event: NotificationEventRecord, outcome: EventOutcome): Promise<void> {
  const db = getDb({ restaurantId: event.restaurantId });
  await db.write({ ...SYSTEM, restaurantId: event.restaurantId }, (tx) =>
    tx.query(
      `update notification_events
          set status = $2, email_state = $3, push_state = $4, last_error = $5,
              next_attempt_at = coalesce($6::timestamptz, next_attempt_at),
              locked_until = null,
              processed_at = case when $2 in ('done', 'dead') then now() else processed_at end
        where id = $1 and restaurant_id = $7`,
      [
        event.id,
        outcome.status,
        outcome.emailState,
        outcome.pushState,
        outcome.lastError?.slice(0, 500) ?? null,
        outcome.nextAttemptAt?.toISOString() ?? null,
        event.restaurantId,
      ],
    ),
  );
}

export async function listActivePushTokens(restaurantId: string, customerId: string): Promise<string[]> {
  const db = getDb({ restaurantId });
  const rows = await db.write({ ...SYSTEM, restaurantId }, (tx) =>
    tx.query<Row>(
      `select token from customer_push_tokens
        where restaurant_id = $1 and customer_id = $2 and is_active
        order by last_seen_at desc
        limit 20`,
      [restaurantId, customerId],
    ),
  );
  return rows.map((row) => str(row.token));
}

export async function deactivatePushTokens(restaurantId: string, tokens: readonly string[], reason: string): Promise<void> {
  if (tokens.length === 0) return;
  const db = getDb({ restaurantId });
  await db.write({ ...SYSTEM, restaurantId }, (tx) =>
    tx.query(
      `update customer_push_tokens
          set is_active = false, deactivated_reason = $3
        where restaurant_id = $1 and token = any($2::text[])`,
      [restaurantId, tokens, reason.slice(0, 200)],
    ),
  );
}

export interface PushTokenInput {
  restaurantId: string;
  customerId: string;
  token: string;
  platform: "web" | "android" | "ios";
  userAgent: string | null;
}

/** Links a device token to a customer; re-registering the same pair re-activates it. */
export async function upsertPushToken(input: PushTokenInput): Promise<void> {
  const db = getDb({ restaurantId: input.restaurantId });
  await db.write({ ...SYSTEM, restaurantId: input.restaurantId }, (tx) =>
    tx.query(
      `insert into customer_push_tokens (restaurant_id, customer_id, token, platform, user_agent)
       values ($1, $2, $3, $4, $5)
       on conflict (restaurant_id, customer_id, token)
       do update set is_active = true, deactivated_reason = null, platform = excluded.platform,
                     user_agent = excluded.user_agent, last_seen_at = now()`,
      [input.restaurantId, input.customerId, input.token, input.platform, input.userAgent?.slice(0, 300) ?? null],
    ),
  );
}
