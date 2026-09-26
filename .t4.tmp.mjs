import { chromium } from "@playwright/test";
const out = ".shots";
const b = await chromium.launch({ channel: "msedge" });
const errors = [];
const base = "http://localhost:3100";
async function page(ctx, tag) {
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(tag + " pageerror " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !m.text().includes("favicon")) errors.push(tag + " console " + m.text().slice(0, 160)); });
  return p;
}
async function scrollAll(p) {
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 120)); } window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 600)); });
}
for (const [w, h, tag] of [[1360, 900, "d"], [390, 844, "m"]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
  const p = await page(ctx, tag);
  await p.goto(base + "/r/zaytoun", { waitUntil: "networkidle", timeout: 180000 });
  await scrollAll(p);
  await p.screenshot({ path: `${out}/home-${tag}.png`, fullPage: true });
  await p.goto(base + "/r/zaytoun/menu", { waitUntil: "networkidle" });
  await p.waitForTimeout(4000);
  await p.locator("a[href*='/menu/lamb-kofta-skewers']").first().click();
  for (let i = 0; i < 20; i++) { await p.waitForTimeout(700); if (await p.locator("[role=dialog]").count()) break; }
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${out}/dish-${tag}.png` });
  await p.keyboard.press("Escape");
  await p.waitForTimeout(2500);
  console.log(tag, "after Escape url", p.url().replace(base, ""), "dialogs", await p.locator("[role=dialog]").count());
  await p.locator("a[data-tray-target]:visible").first().click();
  for (let i = 0; i < 30; i++) { await p.waitForTimeout(1000); if (await p.locator("[role=dialog] ul li").count()) break; }
  await p.screenshot({ path: `${out}/tray-${tag}.png` });
  console.log(tag, "tray dialog", await p.locator("[role=dialog]").count(), "scrollW", await p.evaluate(() => document.documentElement.scrollWidth));
  // admin
  const a = await page(ctx, tag + "-admin");
  await a.goto(base + "/admin/login", { waitUntil: "networkidle" });
  await a.waitForTimeout(3000);
  await a.fill('input[type="email"]', "owner@zaytoun.pk");
  await a.fill('input[type="password"]', "Zaytoun#1");
  await a.click('button[type="submit"]');
  await a.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 90000 });
  await a.waitForLoadState("networkidle");
  await a.screenshot({ path: `${out}/admin-${tag}.png` });
  console.log(tag, "admin scrollW", await a.evaluate(() => document.documentElement.scrollWidth));
  await a.goto(base + "/admin/orders", { waitUntil: "networkidle" });
  console.log(tag, "orders scrollW", await a.evaluate(() => document.documentElement.scrollWidth));
  await ctx.close();
}
console.log(errors.length ? [...new Set(errors)].join("\n") : "no errors");
await b.close();
