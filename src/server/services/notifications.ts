import { config } from "@/server/config";
import { signOrderAccessToken } from "@/server/auth/tokens";
import { errors } from "@/server/errors";
import { createFcmProvider } from "@/server/integrations/fcm";
import { createResendProvider } from "@/server/integrations/resend";
import { logger } from "@/server/logger";
import { channelsFor, pushCopyFor } from "@/server/notifications/rules";
import { renderOrderCompletedEmail } from "@/server/notifications/templates/order-completed";
import { renderOrderConfirmationEmail, type RenderedEmail } from "@/server/notifications/templates/order-confirmation";
import type {
  ChannelState,
  EmailProvider,
  NotificationEventRecord,
  NotificationOrderContext,
  PushProvider,
} from "@/server/notifications/types";
import type { RequestContext } from "@/server/context";
import type { Restaurant } from "@/shared/contract/models";
import { notificationChannelsEnabled } from "@/shared/notification-channels";
import {
  claimDueNotificationEvents,
  deactivatePushTokens,
  listActivePushTokens,
  loadNotificationOrderContext,
  saveNotificationOutcome,
  upsertPushToken,
  type EventOutcome,
} from "@/server/repositories/notifications";
import type { RegisterPushTokenInput } from "@/server/validation/notifications";
import { findVisitorOrder } from "./orders";

/**
 * Customer notifications.
 *
 *   order committed / status changed
 *        │  (DB trigger, same transaction)
 *        ▼
 *   notification_events  ── outbox, unique (order, event) ──►  NotificationService.dispatchDue()
 *                                                                ├─ EmailProvider (Resend)
 *                                                                └─ PushProvider  (FCM)
 *
 * The order flow never calls a provider. It only commits; this service delivers
 * afterwards, so a provider outage can delay a message but never fail or roll
 * back an order. Delivery state is stored per channel, so a retry cannot resend
 * a channel that already succeeded.
 */

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 20;
const CONCURRENCY = 5;
/** minutes to wait after failed attempt 1, 2, 3 … (the last value repeats) */
const BACKOFF_MINUTES = [1, 5, 15, 60];

export interface NotificationStore {
  claimDue: typeof claimDueNotificationEvents;
  loadContext: typeof loadNotificationOrderContext;
  activeTokens: typeof listActivePushTokens;
  deactivateTokens: typeof deactivatePushTokens;
  saveOutcome: typeof saveNotificationOutcome;
}

const repositoryStore: NotificationStore = {
  claimDue: claimDueNotificationEvents,
  loadContext: loadNotificationOrderContext,
  activeTokens: listActivePushTokens,
  deactivateTokens: deactivatePushTokens,
  saveOutcome: saveNotificationOutcome,
};

export interface NotificationServiceDeps {
  /** null = not configured: that channel is skipped, never failed */
  email: EmailProvider | null;
  push: PushProvider | null;
  siteUrl: string;
  maxAgeHours: number;
  store?: NotificationStore;
  signAccessToken?: typeof signOrderAccessToken;
}

/** Which database to work on; structurally the same as the registry's scope, without importing the db layer. */
export interface DispatchScope {
  restaurantId?: string | null;
}

export interface DispatchSummary {
  claimed: number;
  done: number;
  retrying: number;
  dead: number;
}

interface ChannelResult {
  /** null = transient failure, try again later */
  state: ChannelState | null;
  error?: string;
}

export class NotificationService {
  private readonly store: NotificationStore;
  private readonly sign: typeof signOrderAccessToken;

  constructor(private readonly deps: NotificationServiceDeps) {
    this.store = deps.store ?? repositoryStore;
    this.sign = deps.signAccessToken ?? signOrderAccessToken;
  }

  /** Claims due events and delivers them. Never throws. */
  async dispatchDue(options: { limit?: number; restaurantId?: string | null } = {}, scope: DispatchScope = {}): Promise<DispatchSummary> {
    const summary: DispatchSummary = { claimed: 0, done: 0, retrying: 0, dead: 0 };
    let events: NotificationEventRecord[];
    try {
      events = await this.store.claimDue(
        { limit: options.limit ?? BATCH_SIZE, maxAgeHours: this.deps.maxAgeHours, restaurantId: options.restaurantId ?? null },
        scope,
      );
    } catch (error) {
      logger.error("notifications", "could not claim due events", error);
      return summary;
    }
    summary.claimed = events.length;

    for (let index = 0; index < events.length; index += CONCURRENCY) {
      const chunk = events.slice(index, index + CONCURRENCY);
      const results = await Promise.all(chunk.map((event) => this.processEvent(event)));
      for (const status of results) {
        if (status === "done") summary.done += 1;
        else if (status === "pending") summary.retrying += 1;
        else summary.dead += 1;
      }
    }
    return summary;
  }

  /** Delivers one claimed event and records the outcome. Never throws. */
  async processEvent(event: NotificationEventRecord): Promise<EventOutcome["status"]> {
    let outcome: EventOutcome;
    try {
      outcome = await this.deliver(event);
    } catch (error) {
      logger.error("notifications", `event ${event.id} (${event.eventType}) failed unexpectedly`, error);
      outcome = this.retryOrGiveUp(event, event.emailState, event.pushState, [error instanceof Error ? error.message : "unexpected error"]);
    }
    try {
      await this.store.saveOutcome(event, outcome);
    } catch (error) {
      // The claim lock expires on its own and the event is picked up again.
      logger.error("notifications", `could not record outcome for event ${event.id}`, error);
    }
    return outcome.status;
  }

  private async deliver(event: NotificationEventRecord): Promise<EventOutcome> {
    const context = await this.store.loadContext(event);
    // Multi-tenant guard: the order must belong to the event's own restaurant.
    if (!context || context.restaurant.id !== event.restaurantId || context.order.restaurantId !== event.restaurantId) {
      return { status: "dead", emailState: "skipped", pushState: "skipped", lastError: "order not found for this restaurant" };
    }

    // the event type decides what is sent; the restaurant's own switches decide whether it may be
    const rule = channelsFor(event.eventType);
    const enabled = context.restaurant.channels;
    let emailState = event.emailState;
    let pushState = event.pushState;
    const problems: string[] = [];

    if (emailState === null) {
      if (!rule.email || !enabled.email) emailState = "skipped";
      else {
        const result = await this.sendEmail(event, context);
        emailState = result.state;
        if (result.error) problems.push(result.error);
      }
    }
    if (pushState === null) {
      if (!rule.push || !enabled.push) pushState = "skipped";
      else {
        const result = await this.sendPush(event, context);
        pushState = result.state;
        if (result.error) problems.push(result.error);
      }
    }

    if (emailState === null || pushState === null) return this.retryOrGiveUp(event, emailState, pushState, problems);
    return {
      status: "done",
      emailState,
      pushState,
      lastError: problems.length ? problems.join(" | ") : null,
    };
  }

  private retryOrGiveUp(
    event: NotificationEventRecord,
    emailState: ChannelState | null,
    pushState: ChannelState | null,
    problems: string[],
  ): EventOutcome {
    const lastError = problems.length ? problems.join(" | ") : null;
    if (event.attempts >= MAX_ATTEMPTS) {
      return { status: "dead", emailState: emailState ?? "failed", pushState: pushState ?? "failed", lastError };
    }
    const wait = BACKOFF_MINUTES[Math.min(event.attempts, BACKOFF_MINUTES.length) - 1] ?? BACKOFF_MINUTES.at(-1)!;
    return { status: "pending", emailState, pushState, lastError, nextAttemptAt: new Date(Date.now() + wait * 60_000) };
  }

  // ── email ────────────────────────────────────────────────────────────────

  private async sendEmail(event: NotificationEventRecord, context: NotificationOrderContext): Promise<ChannelResult> {
    const provider = this.deps.email;
    if (!provider) {
      logger.warn("notifications", `email not configured; skipping ${event.eventType} for order ${context.order.orderNumber}`);
      return { state: "skipped" };
    }
    const { order, restaurant } = context;
    if (!order.customerEmail) return { state: "skipped" };

    const { orderUrl, reviewUrl } = await this.links(context);
    let rendered: RenderedEmail;
    if (event.eventType === "confirmed") {
      rendered = renderOrderConfirmationEmail({ restaurant, order, orderUrl });
    } else if (event.eventType === "completed") {
      rendered = renderOrderCompletedEmail({ restaurant, order, orderUrl, reviewUrl });
    } else {
      return { state: "skipped" };
    }

    const result = await provider.send({
      to: order.customerEmail,
      fromName: restaurant.name,
      replyTo: restaurant.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      idempotencyKey: `order-${order.id}-${event.eventType}-email`,
    });
    if (result.ok) return { state: "sent" };
    return { state: result.retryable ? null : "failed", error: `email: ${result.error}` };
  }

  // ── push ─────────────────────────────────────────────────────────────────

  private async sendPush(event: NotificationEventRecord, context: NotificationOrderContext): Promise<ChannelResult> {
    const provider = this.deps.push;
    if (!provider) return { state: "skipped" };
    const { order, restaurant } = context;
    if (!order.customerId) return { state: "skipped" };

    const copy = pushCopyFor(event.eventType, {
      orderNumber: order.orderNumber,
      restaurantName: restaurant.name,
      orderType: order.orderType,
    });
    if (!copy) return { state: "skipped" };

    // Tokens are looked up under the order's own restaurant + customer.
    const tokens = await this.store.activeTokens(restaurant.id, order.customerId);
    if (tokens.length === 0) return { state: "skipped" };

    const { orderUrl } = await this.links(context);
    const outcomes = await provider.send(tokens, {
      title: copy.title,
      body: copy.body,
      link: orderUrl,
      dedupeKey: `order-${order.id}-${event.eventType}`,
      data: {
        restaurantId: restaurant.id,
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: event.eventType,
        url: orderUrl,
      },
    });

    const dead = outcomes.filter((outcome) => !outcome.ok && outcome.invalidToken).map((outcome) => outcome.token);
    if (dead.length) {
      await this.store.deactivateTokens(restaurant.id, dead, "rejected by FCM (unregistered or invalid)").catch((error) => {
        logger.error("notifications", "could not deactivate invalid push tokens", error);
      });
    }

    if (outcomes.some((outcome) => outcome.ok)) return { state: "sent" };
    const failures = outcomes.filter((outcome) => !outcome.ok);
    const transient = failures.some((outcome) => !outcome.ok && outcome.retryable);
    const detail = failures.map((outcome) => (outcome.ok ? "" : outcome.error)).filter(Boolean).slice(0, 3).join("; ");
    if (transient) return { state: null, error: `push: ${detail}` };
    // Every token was permanently rejected: nothing left to try.
    return { state: dead.length === failures.length ? "skipped" : "failed", error: dead.length === failures.length ? undefined : `push: ${detail}` };
  }

  private async links(context: NotificationOrderContext): Promise<{ orderUrl: string; reviewUrl: string | null }> {
    const { order, restaurant } = context;
    const token = await this.sign({ orderId: order.id, restaurantId: restaurant.id });
    const base = `${this.deps.siteUrl}/r/${restaurant.slug}`;
    const number = encodeURIComponent(order.orderNumber);
    return {
      orderUrl: `${base}/order/${number}?t=${encodeURIComponent(token)}`,
      // the existing review route; the token lets it work from any device
      reviewUrl: restaurant.reviewsEnabled ? `${base}/reviews?order=${number}&t=${encodeURIComponent(token)}` : null,
    };
  }
}

// ── wiring ─────────────────────────────────────────────────────────────────

let shared: NotificationService | null = null;

/** Providers are built from configuration; an unconfigured channel becomes null (skipped). */
export function getNotificationService(): NotificationService {
  if (!shared) {
    const { resend, fromAddress, maxPerSecond } = config.email;
    const { fcm } = config.push;
    shared = new NotificationService({
      email: resend ? createResendProvider({ apiKey: resend.apiKey, fromAddress, maxPerSecond }) : null,
      push: fcm ? createFcmProvider(fcm) : null,
      siteUrl: config.app.siteUrl,
      maxAgeHours: config.notifications.maxAgeHours,
    });
  }
  return shared;
}

/**
 * Fire-and-forget entry point for callers that just changed an order (checkout
 * action, a future admin action, the cron route). Never throws, so it can never
 * affect the order that triggered it.
 */
export function dispatchDueNotifications(
  options: { limit?: number; restaurantId?: string | null } = {},
  scope: DispatchScope = {},
): Promise<DispatchSummary> {
  // One dispatcher per restaurant per process. Every checkout / status change calls this, so a
  // burst of orders would otherwise start dozens of dispatchers competing with page requests for
  // database connections. A call that arrives while one is running does not start another: it
  // flags a re-run (so its own new event is picked up) and waits for the same result.
  const key = options.restaurantId ?? scope.restaurantId ?? "*";
  const active = inFlight.get(key);
  if (active) {
    active.rerun = true;
    return active.promise;
  }
  const entry: { rerun: boolean; promise: Promise<DispatchSummary> } = { rerun: false, promise: undefined as never };
  entry.promise = (async () => {
    const total = emptySummary();
    try {
      do {
        entry.rerun = false;
        addSummary(total, await runDispatchPass(options, scope));
      } while (entry.rerun);
    } finally {
      inFlight.delete(key);
    }
    return total;
  })();
  inFlight.set(key, entry);
  return entry.promise;
}

/**
 * Keeps dispatching until nothing is due (or the time budget is spent). For the scheduler route,
 * where one call must be able to clear a backlog larger than a single batch. Never throws.
 */
export async function drainDueNotifications(
  options: { limit?: number; budgetMs?: number } = {},
  scope: DispatchScope = {},
): Promise<DispatchSummary> {
  const limit = options.limit ?? 50;
  const deadline = Date.now() + (options.budgetMs ?? 45_000);
  const total = emptySummary();
  do {
    // not coalesced with dispatchDueNotifications: the batch size seen here must be this call's own
    const pass = await runDispatchPass({ limit }, scope);
    addSummary(total, pass);
    // a short batch means the queue is empty; events waiting for their retry time are not "due"
    if (pass.claimed < limit) break;
  } while (Date.now() < deadline);
  return total;
}

const inFlight = new Map<string, { rerun: boolean; promise: Promise<DispatchSummary> }>();
const emptySummary = (): DispatchSummary => ({ claimed: 0, done: 0, retrying: 0, dead: 0 });
function addSummary(total: DispatchSummary, add: DispatchSummary): void {
  total.claimed += add.claimed;
  total.done += add.done;
  total.retrying += add.retrying;
  total.dead += add.dead;
}

// At most this many dispatch passes run at once in one process, across all restaurants.
const MAX_CONCURRENT_PASSES = 3;
let activePasses = 0;
const passQueue: (() => void)[] = [];

async function runDispatchPass(
  options: { limit?: number; restaurantId?: string | null },
  scope: DispatchScope,
): Promise<DispatchSummary> {
  if (activePasses >= MAX_CONCURRENT_PASSES) await new Promise<void>((resolve) => passQueue.push(resolve));
  else activePasses += 1;
  try {
    return await getNotificationService().dispatchDue(options, scope);
  } catch (error) {
    logger.error("notifications", "dispatch failed", error);
    return emptySummary();
  } finally {
    // hand the slot to the next waiting pass, or free it
    const next = passQueue.shift();
    if (next) next();
    else activePasses -= 1;
  }
}

// ── push token registration ────────────────────────────────────────────────

/** Public Firebase web config, only when the server can also send (otherwise the opt-in is hidden). */
export function getPushClientConfig() {
  return config.push.fcm ? config.push.web : null;
}

/** Same, but also null when this restaurant has notifications or push switched off in `features`. */
export function getPushClientConfigFor(restaurant: Pick<Restaurant, "features">) {
  return notificationChannelsEnabled(restaurant.features).push ? getPushClientConfig() : null;
}

/**
 * Links a browser's FCM token to the customer who placed the order. The caller
 * must be able to prove they own the order (same device cookie, or the signed
 * link from the email), so nobody can attach a device to someone else's order.
 */
export async function registerPushToken(
  restaurant: Restaurant,
  input: RegisterPushTokenInput,
  visitor: RequestContext,
  userAgent: string | null,
): Promise<void> {
  if (!notificationChannelsEnabled(restaurant.features).push) {
    throw errors.validation("Push notifications are not available for this restaurant.");
  }
  const order = await findVisitorOrder(restaurant.id, input.orderNumber, visitor, input.accessToken || null);
  if (!order) throw errors.forbidden("We could not match that order to this device.");
  if (!order.customerId) throw errors.validation("This order has no customer to notify.");
  await upsertPushToken({
    restaurantId: restaurant.id,
    customerId: order.customerId,
    token: input.token,
    platform: input.platform,
    userAgent,
  });
}
