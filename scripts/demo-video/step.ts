/**
 * Scouting helper: runs one JS snippet file against the persistent headless Chrome (CDP :9444) — `page` is in scope —
 * then saves a screenshot. Usage: tsx scripts/demo-video/step.ts <snippet.js> <screenshot.png>
 */
import { readFileSync } from "node:fs";
import { chromium, type Page } from "playwright-core";

const [snippet, shot] = process.argv.slice(2);
const browser = await chromium.connectOverCDP("http://127.0.0.1:9444");
const context = browser.contexts()[0]!;
const page: Page = context.pages()[0] ?? (await context.newPage());
await page.setViewportSize({ width: 1920, height: 1080 });
const run = new Function("page", `return (async () => { ${readFileSync(snippet!, "utf8")} })();`) as (p: Page) => Promise<unknown>;
try {
  const result = await run(page);
  if (result !== undefined) console.log(typeof result === "string" ? result : JSON.stringify(result, null, 1));
} catch (error) {
  console.log("ERROR:", String(error).slice(0, 600));
}
await page.waitForTimeout(500);
if (shot) await page.screenshot({ path: shot });
console.log("URL:", page.url());
process.exit(0);
