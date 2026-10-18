/**
 * Demo-video recorder: drives a real Chrome (Playwright) at 1920×1080 and captures it frame-by-frame through the
 * DevTools screencast, so the footage is the actual running site — no screenshots-as-slides.
 *
 * - A visible cursor + click ripple and a caption bar are injected as overlays (headless Chrome draws no cursor).
 * - `pause()`/`resume()` drop frames while pages load, so loading states never reach the video.
 * - `mark(name)` stamps the edited timeline (for the promo cut).
 * - `card(html)` records a full-screen title card (intro, chapter, outro) in the same stream.
 *
 * Output: `<out>/frames/*.jpg` + `<out>/timeline.json` — `assemble.ts` turns that into MP4s.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type CDPSession, type Locator, type Page } from "playwright-core";

export interface TimelineFrame {
  file: string;
  /** seconds on the edited (pause-free) timeline */
  at: number;
}
export interface Timeline {
  frames: TimelineFrame[];
  end: number;
  marks: Record<string, number>;
}

const OVERLAY_SCRIPT = String.raw`
(() => {
  if (window.__demoOverlay) return;
  window.__demoOverlay = true;
  const install = () => {
    if (document.getElementById("__demo-style")) return;
    const style = document.createElement("style");
    style.id = "__demo-style";
    style.textContent = [
      "html{scrollbar-width:none} ::-webkit-scrollbar{display:none!important}",
      "#__demo-cursor{position:fixed;left:0;top:0;width:26px;height:26px;z-index:2147483647;pointer-events:none;transform:translate(-200px,-200px);transition:opacity .2s;filter:drop-shadow(0 2px 3px rgba(0,0,0,.35))}",
      ".__demo-ripple{position:fixed;z-index:2147483646;pointer-events:none;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;border:3px solid rgba(255,255,255,.95);background:rgba(37,99,74,.28);box-shadow:0 0 0 2px rgba(37,99,74,.45);animation:__demo-ripple .55s ease-out forwards}",
      "@keyframes __demo-ripple{from{transform:scale(.35);opacity:1}to{transform:scale(1.25);opacity:0}}",
      "#__demo-caption{position:fixed;left:48px;bottom:40px;z-index:2147483645;pointer-events:none;transform:translateY(24px);opacity:0;transition:opacity .45s ease,transform .45s cubic-bezier(.2,.8,.2,1);max-width:1180px;display:flex;align-items:center;gap:18px;padding:18px 30px 18px 22px;border-radius:18px;background:rgba(12,22,18,.86);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 18px 50px rgba(0,0,0,.35),inset 0 0 0 1px rgba(255,255,255,.08);font-family:Inter,'Segoe UI',system-ui,sans-serif;color:#fff}",
      "#__demo-caption.show{opacity:1;transform:none}",
      "#__demo-caption .k{flex:none;font-size:12px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#0c1612;background:#9fe0b9;border-radius:999px;padding:6px 12px}",
      "#__demo-caption .t{font-size:25px;font-weight:600;line-height:1.3;letter-spacing:-.01em}",
    ].join("\n");
    document.documentElement.appendChild(style);
    const cursor = document.createElement("div");
    cursor.id = "__demo-cursor";
    cursor.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2.5l15.5 9.2-6.9 1.5 3.9 7.3-2.9 1.5-3.9-7.3L4.6 19.3z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(cursor);
    const caption = document.createElement("div");
    caption.id = "__demo-caption";
    caption.innerHTML = '<span class="k"></span><span class="t"></span>';
    document.documentElement.appendChild(caption);
    const pos = window.__demoPos || { x: -200, y: -200 };
    cursor.style.transform = "translate(" + pos.x + "px," + pos.y + "px)";
    if (window.__demoCaptionState) window.__demoCaption(window.__demoCaptionState.k, window.__demoCaptionState.t, true);
  };
  window.__demoCaption = (kicker, text, instant) => {
    const el = document.getElementById("__demo-caption");
    window.__demoCaptionState = text ? { k: kicker, t: text } : null;
    if (!el) return;
    if (!text) { el.classList.remove("show"); return; }
    el.querySelector(".k").textContent = kicker || "";
    el.querySelector(".k").style.display = kicker ? "" : "none";
    el.querySelector(".t").textContent = text;
    if (instant) el.style.transition = "none";
    el.classList.add("show");
    if (instant) requestAnimationFrame(() => (el.style.transition = ""));
  };
  document.addEventListener("mousemove", (e) => {
    window.__demoPos = { x: e.clientX, y: e.clientY };
    const c = document.getElementById("__demo-cursor");
    if (c) c.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px)";
  }, true);
  document.addEventListener("mousedown", (e) => {
    const r = document.createElement("div");
    r.className = "__demo-ripple";
    r.style.left = e.clientX + "px";
    r.style.top = e.clientY + "px";
    document.documentElement.appendChild(r);
    setTimeout(() => r.remove(), 700);
  }, true);
  // Privacy: swap configured strings (e.g. a real phone number) for demo values in what is DISPLAYED — text nodes
  // and input values — on every render. Data on the server is untouched.
  const rules = (window.__demoRedactions || []).map(([from, to]) => [new RegExp(from.split("").map((ch) => (/[a-z0-9]/i.test(ch) ? ch : "\\" + ch)).join("[ -]?"), "g"), to]);
  const redact = (root) => {
    if (!rules.length || !root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      let text = node.nodeValue;
      for (const [re, to] of rules) text = text.replace(re, to);
      if (text !== node.nodeValue) node.nodeValue = text;
    }
    root.querySelectorAll && root.querySelectorAll("input,textarea").forEach((el) => {
      let v = el.value;
      for (const [re, to] of rules) v = v.replace(re, to);
      if (v !== el.value) el.value = v;
    });
  };
  if (rules.length) {
    const run = () => redact(document.body);
    document.addEventListener("DOMContentLoaded", () => {
      run();
      new MutationObserver(run).observe(document.body, { childList: true, subtree: true, characterData: true });
    });
    setInterval(run, 200);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install); else install();
  new MutationObserver(() => { if (!document.getElementById("__demo-cursor") && document.body) install(); }).observe(document.documentElement, { childList: true });
})();
`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class Recorder {
  browser!: Browser;
  context!: BrowserContext;
  page!: Page;
  private cdp!: CDPSession;
  private framesDir: string;
  private frames: TimelineFrame[] = [];
  private marks: Record<string, number> = {};
  private recording = false;
  /** wall-clock ms when the current recording span started, and the edited time at that moment */
  private spanStartWall = 0;
  private spanStartEdited = 0;
  private counter = 0;
  private mouse = { x: 960, y: 540 };
  private captionState: { kicker: string; text: string } | null = null;

  constructor(private outDir: string) {
    this.framesDir = path.join(outDir, "frames");
  }

  async start(options: { storageState?: string } = {}) {
    rmSync(this.framesDir, { recursive: true, force: true });
    mkdirSync(this.framesDir, { recursive: true });
    this.browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--hide-scrollbars", "--force-color-profile=srgb"] });
    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 1,
      storageState: options.storageState,
      locale: "en-PK",
      timezoneId: "Asia/Karachi",
      permissions: [],
    });
    const redactions = (process.env.DEMO_REDACT ?? "")
      .split(",")
      .map((pair) => pair.split("=>").map((part) => part.trim()))
      .filter((pair): pair is [string, string] => pair.length === 2 && Boolean(pair[0]));
    await this.context.addInitScript(`window.__demoRedactions = ${JSON.stringify(redactions)};`);
    await this.context.addInitScript(OVERLAY_SCRIPT);
    this.page = await this.context.newPage();
    this.cdp = await this.context.newCDPSession(this.page);
    this.cdp.on("Page.screencastFrame", async (frame: { data: string; sessionId: number }) => {
      await this.cdp.send("Page.screencastFrameAck", { sessionId: frame.sessionId }).catch(() => {});
      if (!this.recording) return;
      const file = `f${String(this.counter++).padStart(6, "0")}.jpg`;
      writeFileSync(path.join(this.framesDir, file), Buffer.from(frame.data, "base64"));
      this.frames.push({ file, at: this.now() });
    });
    await this.cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  }

  /** current position on the edited timeline (seconds) */
  now(): number {
    return this.recording ? this.spanStartEdited + (Date.now() - this.spanStartWall) / 1000 : this.spanStartEdited;
  }

  resume() {
    if (this.recording) return;
    this.spanStartWall = Date.now();
    this.recording = true;
  }

  /** Resume capture and force a repaint, so a static screen still produces its first frame right away. */
  async live() {
    this.resume();
    await this.page
      .evaluate(() => {
        let dot = document.getElementById("__demo-tick");
        if (!dot) {
          dot = document.createElement("div");
          dot.id = "__demo-tick";
          dot.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;z-index:2147483647;pointer-events:none";
          document.documentElement.appendChild(dot);
        }
        dot.style.background = dot.style.background === "rgba(0, 0, 0, 0.01)" ? "rgba(0, 0, 0, 0.02)" : "rgba(0, 0, 0, 0.01)";
      })
      .catch(() => {});
  }

  pause() {
    if (!this.recording) return;
    this.spanStartEdited = this.now();
    this.recording = false;
  }

  mark(name: string) {
    this.marks[name] = this.now();
  }

  async hold(ms: number) {
    await sleep(ms);
  }

  /** Navigate with capture paused, so the video cuts straight from the old page to the loaded new one. */
  async goto(url: string, settleMs = 1200) {
    this.pause();
    await this.page.goto(url, { waitUntil: "load" });
    await this.page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    await this.restoreOverlay();
    await sleep(settleMs);
    await this.live();
  }

  /** Run an action that triggers a navigation/heavy load off-camera, then resume. */
  async offCamera(action: () => Promise<unknown>, settleMs = 900) {
    this.pause();
    await action();
    await this.page.waitForLoadState("load").catch(() => {});
    await this.page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    await this.restoreOverlay();
    await sleep(settleMs);
    await this.live();
  }

  private async restoreOverlay() {
    await this.page.mouse.move(this.mouse.x, this.mouse.y);
    if (this.captionState) await this.page.evaluate(([k, t]) => (window as any).__demoCaption(k, t, true), [this.captionState.kicker, this.captionState.text]);
  }

  async caption(kicker: string, text: string | null) {
    this.captionState = text ? { kicker, text } : null;
    await this.page.evaluate(([k, t]) => (window as any).__demoCaption(k, t, false), [kicker, text ?? ""]).catch(() => {});
  }

  /** Glide the cursor to a point with an eased path. Time-based: always takes `durationMs`, however slow each step is. */
  async moveTo(x: number, y: number, durationMs?: number) {
    const from = { ...this.mouse };
    const distance = Math.hypot(x - from.x, y - from.y);
    const duration = durationMs ?? Math.min(1000, Math.max(320, distance * 0.8));
    const start = Date.now();
    for (;;) {
      const t = Math.min(1, (Date.now() - start) / duration);
      const k = ease(t);
      await this.page.mouse.move(from.x + (x - from.x) * k, from.y + (y - from.y) * k);
      if (t >= 1) break;
      await sleep(12);
    }
    this.mouse = { x, y };
  }

  async moveToLocator(locator: Locator, options: { offsetX?: number; offsetY?: number } = {}) {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    if (!box) throw new Error("element has no box");
    const x = box.x + (options.offsetX ?? box.width / 2);
    const y = box.y + (options.offsetY ?? box.height / 2);
    await this.moveTo(x, y);
    return { x, y };
  }

  async click(locator: Locator, options: { pauseBefore?: number; pauseAfter?: number; offsetX?: number; offsetY?: number } = {}) {
    await this.moveToLocator(locator, options);
    await sleep(options.pauseBefore ?? 220);
    await this.page.mouse.down();
    await sleep(70);
    await this.page.mouse.up();
    await sleep(options.pauseAfter ?? 600);
  }

  async type(locator: Locator, text: string, options: { delay?: number } = {}) {
    await this.click(locator, { pauseAfter: 200 });
    await locator.pressSequentially(text, { delay: options.delay ?? 55 });
    await sleep(350);
  }

  /** Replace whatever a field holds (e.g. a saved profile value) by typing new text on camera. */
  async retype(locator: Locator, text: string, options: { delay?: number } = {}) {
    await this.click(locator, { pauseAfter: 150 });
    await this.page.keyboard.press("Control+A");
    await this.page.keyboard.press("Backspace");
    await locator.pressSequentially(text, { delay: options.delay ?? 55 });
    await sleep(350);
  }

  /** Smooth scroll by `dy` pixels over `ms` (time-based, like moveTo). */
  async scrollBy(dy: number, ms = 1200) {
    const start = Date.now();
    let done = 0;
    for (;;) {
      const t = Math.min(1, (Date.now() - start) / ms);
      const target = Math.round(dy * ease(t));
      if (target !== done) await this.page.mouse.wheel(0, target - done);
      done = target;
      if (t >= 1) break;
      await sleep(12);
    }
    await sleep(250);
  }

  async scrollTo(locator: Locator, offsetFromTop = 140, ms = 1300) {
    const box = await locator.boundingBox();
    if (!box) return;
    await this.scrollBy(box.y - offsetFromTop, ms);
  }

  /** Records a full-screen HTML title card for `ms` (its CSS animations play on camera). */
  async card(html: string, ms: number) {
    this.pause();
    await this.page.setContent(html, { waitUntil: "load" });
    await this.page.evaluate(() => document.fonts.ready).catch(() => {});
    await sleep(150);
    await this.live();
    // cards animate in only once capture is running (see cards.ts `body.go`)
    await this.page.evaluate(() => document.body.classList.add("go")).catch(() => {});
    await sleep(ms);
  }

  async finish() {
    this.pause();
    await this.cdp.send("Page.stopScreencast").catch(() => {});
    const timeline: Timeline = { frames: this.frames, end: this.spanStartEdited, marks: this.marks };
    writeFileSync(path.join(this.outDir, "timeline.json"), JSON.stringify(timeline, null, 1));
    await this.browser.close();
    return timeline;
  }
}
