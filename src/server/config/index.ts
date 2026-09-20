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
    isProduction: env.NODE_ENV === "production",
    siteUrl: env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, ""),
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

export const config = {
  get app() {
    return app();
  },
  get database() {
    return database();
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
};

/** True when a restaurant's chosen online provider has server-side credentials. */
export function isPaymentProviderConfigured(provider: string): boolean {
  if (!/^[a-z0-9_]+$/i.test(provider)) return false;
  return Boolean(process.env[`${provider.toUpperCase()}_SECRET_KEY`]);
}
