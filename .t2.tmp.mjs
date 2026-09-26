import { chromium } from "@playwright/test";
const SP = process.argv[2];
const b = await chromium.launch({ channel: "msedge" });
const errors = [];
const base = "http://localhost:3100/r/zaytoun";
async function run(w, h, tag) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(tag + " pageerror " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !m.text().includes("favicon")) errors.push(tag + " console " + m.text().slice(0, 160)); });
  await p.goto(base, { waitUntil: "networkidle", timeout: 180000 });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${SP}/h-${tag}.png`, fullPage: true });
  console.log(tag, "home scrollW", await p.evaluate(() => document.documentElement.scrollWidth));
  await p.goto(base + "/menu", { waitUntil: "networkidle" });
  await p.waitForTimeout(4000);
  await p.locator('[data-testid="quick-add-limonana"]').click();
  for (let i = 0; i < 25; i++) { await p.waitForTimeout(1000); if ((await p.locator("[data-sonner-toast]").count()) > 0) break; }
  await p.waitForTimeout(2500);
  console.log(tag, "tray label", await p.locator("a[data-tray-target]:visible").first().getAttribute("aria-label"));
  await p.locator("a[data-tray-target]:visible").first().click();
  await p.waitForTimeout(6000);
  console.log(tag, "drawer url", p.url(), "dialog", await p.locator("[role=dialog]").count());
  await p.screenshot({ path: `${SP}/tray-${tag}.png` });
  await p.goto(base + "/checkout", { waitUntil: "networkidle" });
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${SP}/co-${tag}.png`, fullPage: true });
  console.log(tag, "checkout scrollW", await p.evaluate(() => document.documentElement.scrollWidth), "place-order", await p.locator('[data-testid="place-order"]').count());
  await p.goto(base + "/account/sign-in", { waitUntil: "networkidle" });
  await p.screenshot({ path: `${SP}/si-${tag}.png` });
  await ctx.close();
}
await run(1360, 900, "d");
await run(390, 844, "m");
console.log(errors.length ? [...new Set(errors)].join("\n") : "no errors");
await b.close();
