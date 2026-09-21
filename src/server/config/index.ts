import { z } from "zod";

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

const appSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).catch("development"),
  NEXT_PUBLIC_SITE_URL: z.preprocess(emptyToUndefined, z.string().trim().url().default("http://localhost:3000")),
  NEXT_PUBLIC_DEFAULT_RESTAURANT: z.preprocess(emptyToUndefined, z.string().trim().default("bella-napoli")),
});

const databaseSchema = z.object({
  DATABASE_URL: z.string().trim().min(1, "is required"),
  DATABASE_URL_SERVICE: optionalText,
  DB_POOL_MAX: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(100).default(10)),
});

const booleanFlag = (fallback: boolean) =>
  z.preprocess(
    (value) => (typeof value === "string" ? value.trim().toLowerCase() : value),
    z
      .enum(["true", "false", "1", "0"], { message: "must be true or false" })
      .transform((value) => value === "true" || value === "1")
      .optional()
      .transform((value) => value ?? fallback),
  );

const storefrontCacheSchema = z.object({
  STOREFRONT_CACHE_ENABLED: z.preprocess(emptyToUndefined, booleanFlag(true)),
  STOREFRONT_CACHE_REFRESH_INTERVAL_MS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1_000).max(86_400_000).default(300_000),
  ),
  STOREFRONT_CACHE_STARTUP_TIMEOUT_MS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1_000).max(600_000).default(60_000),
  ),
});

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
});

const orderEventsSchema = z.object({
  // Session-mode / direct Postgres connection used only to LISTEN for order changes (SSE). NOT the transaction pooler.
  DATABASE_URL_LISTEN: optionalText,
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
  const env = parse("storefront cache", storefrontCacheSchema);
  return {
    enabled: env.STOREFRONT_CACHE_ENABLED,
    refreshIntervalMs: env.STOREFRONT_CACHE_REFRESH_INTERVAL_MS,
    /** bounds every snapshot load: startup fails on it, a scheduled refresh is abandoned on it */
    startupTimeoutMs: env.STOREFRONT_CACHE_STARTUP_TIMEOUT_MS,
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
        ? { secretKey: env.STRIPE_SECRET_KEY, publishableKey: env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY }
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
  return { dispatchSecret: env.NOTIFICATIONS_DISPATCH_SECRET ?? null, maxAgeHours: env.NOTIFICATION_MAX_AGE_HOURS };
});

const orderEvents = lazy(() => {
  const env = parse("orderEvents", orderEventsSchema);
  // null = live order updates are not offered (the page still works with the manual Refresh button)
  return { listenUrl: env.DATABASE_URL_LISTEN ?? null };
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
};

/** True when a restaurant's chosen online provider has server-side credentials. */
export function isPaymentProviderConfigured(provider: string): boolean {
  if (!/^[a-z0-9_]+$/i.test(provider)) return false;
  return Boolean(process.env[`${provider.toUpperCase()}_SECRET_KEY`]);
}
