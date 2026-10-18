/**
 * Cancels demo/test orders through the admin UI (same action staff use), so rehearsal runs don't leave orders
 * on the kitchen board. Credentials from env (DEMO_ADMIN_EMAIL / DEMO_ADMIN_PASSWORD), never logged.
 *   tsx scripts/demo-video/cleanup.ts <ORDER-NO> [<ORDER-NO>...]
 */
import { chromium } from "playwright-core";

const BASE = process.env.DEMO_BASE_URL ?? "http://localhost:3100";
const orders = process.argv.slice(2);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
await page.goto(`${BASE}/admin/login`, { waitUntil: "load" });
await page.fill("input[type=email]", process.env.DEMO_ADMIN_EMAIL ?? "");
await page.fill("input[type=password]", process.env.DEMO_ADMIN_PASSWORD ?? "");
await Promise.all([page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30000 }), page.click("button[type=submit]")]);
for (const orderNumber of orders) {
  await page.goto(`${BASE}/admin/orders/${encodeURIComponent(orderNumber)}`, { waitUntil: "load" });
  const cancel = page.getByRole("button", { name: /^cancel order$/i }).first();
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  if (!(await cancel.count())) { await page.screenshot({ path: `cleanup-${orderNumber}.png` }); console.log(orderNumber, ": no cancel button —", page.url()); continue; }
  await cancel.click();
  await page.locator("textarea").first().fill("Demo video rehearsal order");
  await page.getByRole("button", { name: /confirm cancellation/i }).click();
  await page.getByText(/no further changes/i).first().waitFor({ timeout: 20000 }).catch(() => {});
  console.log(orderNumber, ": cancelled");
}
await browser.close();
