import { z } from "zod";
import { resolveTemplateId } from "@/shared/templates";
import { logger } from "@/server/logger";

/**
 * The only module that reads `process.env`. Everything else asks for a typed
 * section, so a missing or malformed variable fails in one place with a message
 * that names the variable (never its value).
 *
 * Sections are resolved lazily and memoised: importing this file has no side
 * effects, which keeps `next build`, tests and scripts free to set the
 * environment first.
 */

const emptyToUndefined = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);
const optionalText = z.preprocess(emptyToUndefined, z.string().trim().optional());

/**
 * One deployment serves ONE restaurant: NEXT_PUBLIC_DEFAULT_RESTAURANT names it (the URL no longer does), and
 * NEXT_PUBLIC_SITE_URL is the origin every email / push / payment-return link is built on. Development and tests
 * fall back to bella-napoli on localhost; production refuses to start without both, rather than silently serving
 * another restaurant or mailing localhost links.
 */
const appSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).catch("development"),
    NEXT_PUBLIC_SITE_URL: z.preprocess(emptyToUndefined, z.string().trim().url().optional()),
    NEXT_PUBLIC_DEFAULT_RESTAURANT: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .trim()
        .regex(/^[a-z0-9][a-z0-9-]*$/, "must be a restaurant slug (lowercase letters, digits, hyphens)")
        .optional(),
    ),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== "production") return;
    if (!env.NEXT_PUBLIC_DEFAULT_RESTAURANT)
      ctx.addIssue({ code: "custom", path: ["NEXT_PUBLIC_DEFAULT_RESTAURANT"], message: "is required in production" });
    if (!env.NEXT_PUBLIC_SITE_URL)
      ctx.addIssue({ code: "custom", path: ["NEXT_PUBLIC_SITE_URL"], message: "is required in production" });
  })
  .transform((env) => ({
    ...env,
    NEXT_PUBLIC_SITE_URL: env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
    NEXT_PUBLIC_DEFAULT_RESTAURANT: env.NEXT_PUBLIC_DEFAULT_RESTAURANT ?? "bella-napoli",
  }));

const databaseSchema = z.object({
  DATABASE_URL: z.string().trim().min(1, "is required"),
  DATABASE_URL_SERVICE: optionalText,
  DB_POOL_MAX: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(100).default(10)),
});

/**
 * The storefront cache's settings never stop the app from starting: an invalid value (a typo, "5m", a number out of
 * range) falls back to the documented default with one `[config]` warning, the same way TEMPLATE_ID does. Failing
 * startup over a tuning knob would take the whole storefront down; silently disabling the cache would move every
 * page view onto the database.
 */
const CACHE_DEFAULTS = { enabled: true, refreshIntervalMs: 300_000, startupTimeoutMs: 60_000 } as const;

function cacheMs(name: string, raw: unknown, fallback: number, min: number, max: number): number {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return fallback;
  const value = Number(text);
  if (Number.isInteger(value) && value >= min && value <= max) return value;
  logger.warn("config", `${name} must be a whole number of milliseconds from ${min} to ${max}; using ${fallback}.`);
  return fallback;
}

function cacheFlag(name: string, raw: unknown, fallback: boolean): boolean {
  const text = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!text) return fallback;
  if (text === "true" || text === "1") return true;
  if (text === "false" || text === "0") return false;
  logger.warn("config", `${name} must be true or false; using ${fallback}.`);
  return fallback;
}

const authSchema = z.object({
  AUTH_SECRET: z.string().min(16, "must be at least 16 characters"),
});

const storageSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: optionalText,
  SUPABASE_SERVICE_ROLE_KEY: optionalText,
  SUPABASE_STORAGE_BUCKET: z.preprocess(emptyToUndefined, z.string().trim().default("restaurant-media")),
});

const paymentsSchema = z.object({
  STRIPE_SECRET_KEY: optionalText,
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: optionalText,
  // Signs the Stripe CLI/Dashboard webhook endpoint (`whsec_...`). Optional: checkout still works
  // without it (the return-URL redirect alone confirms payment), but a closed tab or dropped
  // redirect then leaves the order unpaid until staff notice — the webhook is the reliable path.
  STRIPE_WEBHOOK_SECRET: optionalText,
  // JazzCash Hosted Checkout Page (Mobile Wallet). All three required together; see SKILL.md section 18.
  JAZZCASH_MERCHANT_ID: optionalText,
  JAZZCASH_PASSWORD: optionalText,
  JAZZCASH_INTEGRITY_SALT: optionalText,
  // "demo" = simulated JazzCash for demos: checkout goes to an in-app imitation of the payment page instead of
  // JazzCash, and works without the three values above. Marks orders paid with no money moved — never in production.
  JAZZCASH_ENV: z.preprocess(emptyToUndefined, z.enum(["sandbox", "live", "demo"]).default("sandbox")),
  // "true" lets JAZZCASH_ENV=demo run when NODE_ENV=production (a public demo site). Without it demo is off in production.
  ALLOW_PAYMENT_DEMO: z.preprocess(emptyToUndefined, z.string().optional()),
});

const emailSchema = z.object({
  RESEND_API_KEY: optionalText,
  // Verified sending address (or onboarding@resend.dev while testing). The display name is the restaurant's.
  EMAIL_FROM_ADDRESS: z.preprocess(emptyToUndefined, z.string().trim().email().default("onboarding@resend.dev")),
  // Send rate per server process. Resend's default account limit is 2 requests/second; raise it only if your plan allows more.
  EMAIL_MAX_PER_SECOND: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(100).default(2)),
});

const pushSchema = z.object({
  // server-side (Firebase Admin credentials) — never sent to the browser
  FCM_PROJECT_ID: optionalText,
  FCM_CLIENT_EMAIL: optionalText,
  FCM_PRIVATE_KEY: optionalText,
  // public web-app config (safe for the browser; handed to the client by a server component)
  NEXT_PUBLIC_FIREBASE_API_KEY: optionalText,
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: optionalText,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: optionalText,
  NEXT_PUBLIC_FIREBASE_APP_ID: optionalText,
  NEXT_PUBLIC_FIREBASE_VAPID_KEY: optionalText,
});

const notificationsSchema = z.object({
  // shared secret for POST /api/internal/notifications/dispatch (cron / DB webhook)
  NOTIFICATIONS_DISPATCH_SECRET: z.preprocess(emptyToUndefined, z.string().min(16, "must be at least 16 characters").optional()),
  // events older than this are dropped instead of sent late
  NOTIFICATION_MAX_AGE_HOURS: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(168).default(24)),
  // local dev only: how often `npm run notifications:dispatch -- --loop` polls for due events
  NOTIFICATIONS_DISPATCH_INTERVAL_MS: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1_000).max(300_000).default(5_000)),
});

const orderEventsSchema = z.object({
  // Session-mode / direct Postgres connection used only to LISTEN for order changes (SSE). NOT the transaction pooler.
  DATABASE_URL_LISTEN: optionalText,
});

const googleAuthSchema = z.object({
  GOOGLE_CLIENT_ID: optionalText,
  GOOGLE_CLIENT_SECRET: optionalText,
});

const mapsSchema = z.object({
  // public browser key (safe for the client; handed over by a server component, never read via
  // process.env in client code). Restrict it in Google Cloud Console to HTTP referrers for this
  // site and to the Maps JavaScript API and Places API only (reverse geocoding no longer uses Google).
  NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: optionalText,
});

const geocodingSchema = z.object({
  // Swap for a self-hosted Nominatim instance's base URL when one exists; no code change needed.
  NOMINATIM_BASE_URL: z.preprocess(emptyToUndefined, z.string().trim().url().default("https://nominatim.openstreetmap.org")),
  // Nominatim's usage policy requires a way to identify/contact the app operator (a User-Agent naming
  // an app and a contact, not a generic browser UA). Defaults to the site URL, which satisfies that.
  NOMINATIM_CONTACT: optionalText,
});

function parse<T extends z.ZodTypeAny>(section: string, schema: T): z.infer<T> {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join("; ");
    throw new Error(`Invalid ${section} configuration: ${problems}`);
  }
  return result.data;
}

function lazy<T>(load: () => T): () => T {
  let value: T | undefined;
  return () => (value ??= load());
}

const app = lazy(() => {
  const env = parse("app", appSchema);
  return {
    isProduction: env.NODE_ENV === "production",    siteUrl: env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, ""),
    defaultRestaurantSlug: env.NEXT_PUBLIC_DEFAULT_RESTAURANT,
  };
});

const database = lazy(() => {
  const env = parse("database", databaseSchema);
  return {
    /** unprivileged role: every statement runs with RLS enforced */
    url: env.DATABASE_URL,
    /** privileged role for authorised server-side writes; falls back to `url` */
    serviceUrl: env.DATABASE_URL_SERVICE,
    poolMax: env.DB_POOL_MAX,
  };
});

const storefrontCache = lazy(() => {
  const env = process.env;
  return {
    enabled: cacheFlag("STOREFRONT_CACHE_ENABLED", env.STOREFRONT_CACHE_ENABLED, CACHE_DEFAULTS.enabled),
    /** one interval for the whole snapshot: data and image URLs (logo, cover, dish and page photos) alike */
    refreshIntervalMs: cacheMs("STOREFRONT_CACHE_REFRESH_INTERVAL_MS", env.STOREFRONT_CACHE_REFRESH_INTERVAL_MS, CACHE_DEFAULTS.refreshIntervalMs, 1_000, 86_400_000),
    /** bounds every snapshot load: startup fails on it, a scheduled refresh is abandoned on it */
    startupTimeoutMs: cacheMs("STOREFRONT_CACHE_STARTUP_TIMEOUT_MS", env.STOREFRONT_CACHE_STARTUP_TIMEOUT_MS, CACHE_DEFAULTS.startupTimeoutMs, 1_000, 600_000),
  };
});

const auth = lazy(() => ({ secret: parse("auth", authSchema).AUTH_SECRET }));

const storage = lazy(() => {
  const env = parse("storage", storageSchema);
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  return {
    bucket: env.SUPABASE_STORAGE_BUCKET,
    supabase: supabaseUrl && serviceRoleKey ? { url: supabaseUrl, serviceRoleKey } : null,
  };
});

const payments = lazy(() => {
  const env = parse("payments", paymentsSchema);
  return {
    stripe:
      env.STRIPE_SECRET_KEY && env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
        ? {
            secretKey: env.STRIPE_SECRET_KEY,
            publishableKey: env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
            webhookSecret: env.STRIPE_WEBHOOK_SECRET ?? null,
          }
        : null,
    jazzcash:
      // the simulator marks orders paid without money: never on a production deployment unless explicitly allowed (a public demo site)
      env.JAZZCASH_ENV === "demo" && (process.env.NODE_ENV !== "production" || env.ALLOW_PAYMENT_DEMO === "true")
        ? {
            // the simulator signs and verifies with the same scheme, so any salt works; real credentials are optional
            merchantId: env.JAZZCASH_MERCHANT_ID ?? "DEMO",
            password: env.JAZZCASH_PASSWORD ?? "demo",
            integritySalt: env.JAZZCASH_INTEGRITY_SALT ?? "jazzcash-demo-salt",
            env: env.JAZZCASH_ENV,
          }
        : env.JAZZCASH_ENV !== "demo" && env.JAZZCASH_MERCHANT_ID && env.JAZZCASH_PASSWORD && env.JAZZCASH_INTEGRITY_SALT
          ? {
              merchantId: env.JAZZCASH_MERCHANT_ID,
              password: env.JAZZCASH_PASSWORD,
              integritySalt: env.JAZZCASH_INTEGRITY_SALT,
              env: env.JAZZCASH_ENV,
            }
          : null,
  };
});

const email = lazy(() => {
  const env = parse("email", emailSchema);
  return {
    resend: env.RESEND_API_KEY ? { apiKey: env.RESEND_API_KEY } : null,
    fromAddress: env.EMAIL_FROM_ADDRESS,
    maxPerSecond: env.EMAIL_MAX_PER_SECOND,
  };
});

const push = lazy(() => {
  const env = parse("push", pushSchema);
  const web =
    env.NEXT_PUBLIC_FIREBASE_API_KEY &&
    env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
    env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID &&
    env.NEXT_PUBLIC_FIREBASE_APP_ID &&
    env.NEXT_PUBLIC_FIREBASE_VAPID_KEY
      ? {
          apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY,
          projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
          appId: env.NEXT_PUBLIC_FIREBASE_APP_ID,
          vapidKey: env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
        }
      : null;
  return {
    fcm:
      env.FCM_PROJECT_ID && env.FCM_CLIENT_EMAIL && env.FCM_PRIVATE_KEY
        ? {
            projectId: env.FCM_PROJECT_ID,
            clientEmail: env.FCM_CLIENT_EMAIL,
            // .env files store the key on one line with literal \n sequences
            privateKey: env.FCM_PRIVATE_KEY.replace(/\\n/g, "\n"),
          }
        : null,
    /** public Firebase web config; null when push is not fully configured */
    web,
  };
});

const notifications = lazy(() => {
  const env = parse("notifications", notificationsSchema);
  return {
    dispatchSecret: env.NOTIFICATIONS_DISPATCH_SECRET ?? null,
    maxAgeHours: env.NOTIFICATION_MAX_AGE_HOURS,
    dispatchIntervalMs: env.NOTIFICATIONS_DISPATCH_INTERVAL_MS,
  };
});

const orderEvents = lazy(() => {
  const env = parse("orderEvents", orderEventsSchema);
  // null = live order updates are not offered (the page still works with the manual Refresh button)
  return { listenUrl: env.DATABASE_URL_LISTEN ?? null };
});

const googleAuth = lazy(() => {
  const env = parse("googleAuth", googleAuthSchema);
  // null = "Continue with Google" is hidden; the button never renders on an unconfigured deploy.
  return env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
    : null;
});

const maps = lazy(() => {
  const env = parse("maps", mapsSchema);
  // null = the map/search/current-location picker is hidden; checkout falls back to plain text fields.
  return env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? { apiKey: env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY } : null;
});

const geocoding = lazy(() => {
  const env = parse("geocoding", geocodingSchema);
  return {
    baseUrl: env.NOMINATIM_BASE_URL.replace(/\/$/, ""),
    userAgent: `restaurant-platform (${env.NOMINATIM_CONTACT ?? app().siteUrl})`,
  };
});

// TEMPLATE_ID (1 = Classic 2D, the default; 2 = 3D; 3 = placeholder slot). Never fails: an unset or
// unknown value falls back to 1 and is logged once per process.
const template = lazy(() => {
  const resolved = resolveTemplateId(process.env.TEMPLATE_ID);
  if (resolved.warning) logger.warn("config", resolved.warning);
  return { id: resolved.id };
});

export const config = {
  get app() {
    return app();
  },
  get database() {
    return database();
  },
  get storefrontCache() {
    return storefrontCache();
  },
  get auth() {
    return auth();
  },
  get storage() {
    return storage();
  },
  get payments() {
    return payments();
  },
  get email() {
    return email();
  },
  get push() {
    return push();
  },
  get notifications() {
    return notifications();
  },
  get orderEvents() {
    return orderEvents();
  },
  get googleAuth() {
    return googleAuth();
  },
  get maps() {
    return maps();
  },
  get geocoding() {
    return geocoding();
  },
  get template() {
    return template();
  },
};

/**
 * True when a restaurant's chosen online provider has server-side credentials.
 * Reads the typed, already-validated `payments` section rather than guessing an
 * env var name from the provider id — the previous `${provider}_SECRET_KEY` guess
 * matched "stripe" by luck but silently returned false for any provider (like
 * "jazzcash") whose credentials aren't a single `_SECRET_KEY` var.
 */
export function isPaymentProviderConfigured(provider: string): boolean {
  const configured = payments() as Record<string, unknown>;
  return provider in configured && configured[provider] !== null;
}
