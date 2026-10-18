/**
 * Scouting helper for the demo video: opens pages on the demo server and saves full-page screenshots + visible
 * text so shots can be planned. Usage: tsx scripts/demo-video/explore.ts <outDir> <path> [<path>...]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.env.DEMO_BASE_URL ?? "http://localhost:3100";
const [outDir, ...paths] = process.argv.slice(2);
mkdirSync(outDir!, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, storageState: process.env.DEMO_STATE || undefined });
const page = await context.newPage();
for (const path of paths) {
  const name = path.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "") || "home";
  await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 90000 }).catch((e) => console.log("goto", path, String(e).slice(0, 120)));
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: false });
  const text = await page.evaluate("document.body.innerText");
  writeFileSync(`${outDir}/${name}.txt`, String(text));
  console.log(path, "->", page.url(), "|", await page.title());
}
await browser.close();
