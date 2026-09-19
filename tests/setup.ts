import { loadEnv } from "../scripts/db/env";

loadEnv(".env.local");
loadEnv(".env.test");

// Point the application data layer at the disposable test database.
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST ?? "postgresql://app_runtime:app_runtime@localhost:5432/restaurant_platform_test";
process.env.DATABASE_URL_SERVICE =
  process.env.DATABASE_URL_TEST_SERVICE ?? "postgresql://app_service:app_service@localhost:5432/restaurant_platform_test";
process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "test-secret-value-1234567890";
