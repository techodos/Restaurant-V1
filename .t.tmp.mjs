import { chromium } from "@playwright/test";
const SP = process.argv[2];
const b = await chromium.launch({ channel: "msedge" });
const errors = [];
for (const [w, h, tag] of [[1360, 900, "d"], [390, 844, "m"]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, reducedMotion: "reduce" });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => errors.push(tag + " pageerror " + e.message));
  p.on("console", (m) => { if (m.type() === "error") errors.push(tag + " console " + m.text().slice(0, 200)); });
  await p.goto("http://localhost:3100/r/zaytoun/menu", { waitUntil: "networkidle", timeout: 180000 });
  await p.waitForTimeout(4000);
  await p.screenshot({ path: `${SP}/menu-${tag}.png` });
  await p.evaluate(() => window.scrollTo(0, 2600)); await p.waitForTimeout(800);
  await p.screenshot({ path: `${SP}/menu2-${tag}.png` });
  await p.locator("a[href*='/menu/zaytoun-mixed-grill']").first().click();
  await p.waitForTimeout(5000);
  console.log(tag, "url after dish click:", p.url(), "dialog:", await p.locator("[role=dialog]").count());
  await p.screenshot({ path: `${SP}/sheet-${tag}.png` });
  console.log(tag, "scrollW", await p.evaluate(() => document.documentElement.scrollWidth));
  await ctx.close();
}
console.log(errors.length ? errors.join("\n") : "no errors");
await b.close();
