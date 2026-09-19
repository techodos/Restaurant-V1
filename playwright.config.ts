import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end checks drive the real UI against the real database: they are the
 * only way to prove that buttons actually write to Postgres (cart, orders,
 * admin status changes) rather than updating local state.
 *
 * Start the app first (`npm run dev`), then run `npm run test:e2e`.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
