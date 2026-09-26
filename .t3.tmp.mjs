import { chromium } from "@playwright/test";
const b = await chromium.launch({ channel: "msedge" });
const p = await b.newPage({ viewport: { width: 1360, height: 900 } });
const rsc = [];
p.on("request", (r) => { if (r.url().includes("/cart")) rsc.push(r.method() + " " + r.url().slice(-40) + " next-url=" + (r.headers()["next-url"] ?? "-") + " rsc=" + (r.headers()["rsc"] ?? "-")); });
await p.goto("http://localhost:3100/r/zaytoun/menu", { waitUntil: "networkidle", timeout: 180000 });
await p.waitForTimeout(5000);
await p.locator("header a[data-tray-target]").click();
for (let i = 0; i < 30; i++) { await p.waitForTimeout(1000); if (await p.locator("[role=dialog]").count()) break; }
console.log("url", p.url(), "dialog", await p.locator("[role=dialog]").count(), "h1", await p.locator("h1").allInnerTexts());
console.log(rsc.join("\n"));
await b.close();
