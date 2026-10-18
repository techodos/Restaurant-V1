/** Scouting: signs in to /admin (credentials from env) and screenshots the main admin pages. */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.env.DEMO_BASE_URL ?? "http://localhost:3100";
const out = process.argv[2]!;
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();
await page.goto(`${BASE}/admin/login`, { waitUntil: "load" });
await page.fill("input[type=email]", process.env.DEMO_ADMIN_EMAIL ?? "");
await page.fill("input[type=password]", process.env.DEMO_ADMIN_PASSWORD ?? "");
await Promise.all([page.waitForURL((u) => !u.pathname.includes("/login"), { timeout: 30000 }).catch(() => {}), page.click("button[type=submit]")]);
console.log("after login:", page.url());
for (const p of ["/admin", "/admin/orders", "/admin/kitchen", "/admin/menu", "/admin/reservations", "/admin/reports", "/admin/payments", "/admin/locations"]) {
  await page.goto(BASE + p, { waitUntil: "load" });
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(800);
  const name = p.replace(/\W+/g, "_");
  await page.screenshot({ path: `${out}/${name}.png` });
  writeFileSync(`${out}/${name}.txt`, String(await page.evaluate("document.body.innerText")));
  console.log(p, "->", page.url());
}
await context.storageState({ path: `${out}/admin-state.json` });
await browser.close();
