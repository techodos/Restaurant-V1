/**
 * Records the TechOdos demo on the REAL running site (see README.md in this folder).
 *
 *   DEMO_BASE_URL=http://localhost:3100 \
 *   DEMO_CUSTOMER_EMAIL=... DEMO_CUSTOMER_PASSWORD=... \
 *   DEMO_ADMIN_EMAIL=...    DEMO_ADMIN_PASSWORD=... \
 *   tsx scripts/demo-video/record.ts <outDir> [--until=cart]
 *
 * Credentials are read from the environment, typed only into masked fields off-camera, and never logged.
 * The order is a real order on the target server, paid "cash on delivery" (no payment is taken). Run it against a
 * server started with notifications disabled (README) so status changes send no email/push.
 */
import { Recorder } from "./recorder";
import { chapterCard, introCard, outroCard } from "./cards";

const BASE = process.env.DEMO_BASE_URL ?? "http://localhost:3100";
const outDir = process.argv[2] ?? "demo-video-out/recording";
const until = (process.argv.find((a) => a.startsWith("--until=")) ?? "").split("=")[1] ?? "";
const env = (name: string) => process.env[name] ?? "";

const rec = new Recorder(outDir);
await rec.start();
const page = rec.page;
const C = "Customer";
const A = "Restaurant admin";

async function signInCustomer() {
  await page.goto(`${BASE}/account/sign-in`, { waitUntil: "load" });
  await page.fill("input[type=email]", env("DEMO_CUSTOMER_EMAIL"));
  await page.fill("input[type=password]", env("DEMO_CUSTOMER_PASSWORD"));
  await Promise.all([page.waitForURL((url) => !url.pathname.includes("/sign-in"), { timeout: 30000 }), page.click("button[type=submit]")]);
}

async function signInAdmin() {
  await page.goto(`${BASE}/admin/login`, { waitUntil: "load" });
  await page.fill("input[type=email]", env("DEMO_ADMIN_EMAIL"));
  await page.fill("input[type=password]", env("DEMO_ADMIN_PASSWORD"));
  await Promise.all([page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 30000 }), page.click("button[type=submit]")]);
}

try {
  // ── off camera: the customer is already signed in (a returning diner), so checkout needs no email code ──
  const haveCustomer = Boolean(env("DEMO_CUSTOMER_EMAIL") && env("DEMO_CUSTOMER_PASSWORD"));
  if (haveCustomer) await signInCustomer();

  // ── intro ──
  rec.mark("intro");
  await rec.card(introCard(), 5200);
  rec.mark("intro-end");
  await rec.card(chapterCard("Part 1 · The customer", "Ordering, the way diners expect", "A branded website for every restaurant: browse, customise, check out, track."), 3600);

  // ── home ──
  await rec.goto(`${BASE}/`, 900);
  rec.mark("home");
  await rec.caption(C, "Each restaurant gets its own branded ordering website");
  await rec.moveTo(1100, 560, 900);
  await rec.hold(2200);
  await rec.scrollBy(620, 1600);
  await rec.hold(1600);
  await rec.caption(C, "Delivery, pickup or dine-in, with live opening hours");
  await rec.hold(1800);
  await rec.scrollBy(-620, 1200);
  await rec.hold(500);
  const orderOnline = page.getByRole("link", { name: /order online/i }).first();
  await rec.moveToLocator(orderOnline);
  await rec.hold(300);
  await rec.offCamera(() => orderOnline.click(), 900);

  // ── delivery location → branch routing ──
  rec.mark("menu");
  await rec.caption(C, "Customers pick their area: orders route to the branch that delivers there");
  const drawer = page.locator("[role=dialog]").first();
  // the location drawer opens a moment after the menu loads (only for a visitor with no area chosen yet)
  if (await drawer.waitFor({ state: "visible", timeout: 6000 }).then(() => true, () => false)) {
    await rec.hold(1200);
    await rec.click(drawer.locator("select").first(), { pauseAfter: 300 });
    await drawer.locator("select").first().selectOption({ label: "Lahore" });
    await rec.hold(700);
    await rec.click(drawer.locator("select").nth(1), { pauseAfter: 300 });
    await drawer.locator("select").nth(1).selectOption({ label: process.env.DEMO_AREA ?? "Walton" });
    await rec.hold(700);
    await rec.click(drawer.getByRole("button", { name: /find branches/i }), { pauseAfter: 2200 });
  }

  // ── browse the menu ──
  await rec.caption(C, "A photo menu with prices, dietary tags and prep times");
  await rec.moveTo(1180, 700, 800);
  await rec.hold(1400);
  await rec.scrollBy(520, 1500);
  await rec.hold(1200);
  const grillTab = page.getByText("Charcoal Grill", { exact: true }).first();
  await rec.click(grillTab, { pauseAfter: 1800 });
  await rec.hold(800);

  // ── item 1: Chicken Shish Taouk, choose a side ──
  rec.mark("item");
  const taouk = page.getByRole("link", { name: "Chicken Shish Taouk", exact: true }).first();
  await rec.click(taouk, { pauseAfter: 1600 });
  await rec.caption(C, "Sizes, sides, add-ons and notes for the kitchen");
  let modal = page.locator("[role=dialog]").first();
  await rec.hold(800);
  await rec.click(modal.getByText("Garlic potatoes", { exact: true }), { pauseAfter: 600 });
  await rec.click(modal.getByRole("button", { name: /add to cart/i }), { pauseAfter: 1600 });

  // ── item 2: Mezze Sharing Platter (best-seller) ──
  await rec.scrollBy(-900, 1300);
  await rec.hold(400);
  const mezze = page.getByRole("link", { name: "Mezze Sharing Platter", exact: true }).first();
  await rec.click(mezze, { pauseAfter: 1500 });
  modal = page.locator("[role=dialog]").first();
  await rec.click(modal.getByText("Toum (garlic)", { exact: true }), { pauseAfter: 600 });
  await rec.click(modal.getByRole("button", { name: /add to cart/i }), { pauseAfter: 1500 });
  rec.mark("item-end");

  // ── cart: adjust quantity ──
  await rec.offCamera(() => page.goto(`${BASE}/cart`, { waitUntil: "load" }), 700);
  rec.mark("cart");
  await rec.caption(C, "A clear cart: change quantities or keep browsing");
  await rec.hold(1200);
  await rec.click(page.getByRole("button", { name: /increase quantity of chicken shish taouk/i }), { pauseAfter: 1500 });
  await rec.moveToLocator(page.getByText(/subtotal/i).first());
  await rec.hold(1400);
  rec.mark("cart-end");
  if (until === "cart" || !haveCustomer) throw new Error("__stop__");

  // ── checkout ──
  await rec.offCamera(() => page.getByRole("button", { name: /checkout/i }).first().click().then(() => page.waitForURL(/\/checkout/)), 900);
  rec.mark("checkout");
  await rec.caption(C, "One-page checkout: delivery, pickup or dine-in");
  await rec.hold(1500);
  // demo identity typed on camera, so the signed-in account's own name/phone/address never appear in the video
  await rec.caption(C, "Contact and delivery details, saved for next time");
  const fullName = page.locator("#fullName");
  if (await fullName.count()) await rec.retype(fullName, process.env.DEMO_DINER_NAME ?? "Ayesha Khan");
  const phone = page.locator("#phone");
  if (await phone.count()) await rec.retype(phone, process.env.DEMO_DINER_PHONE ?? "3001234567");
  const address = page.locator("#addressLine1");
  if (await address.count()) await rec.retype(address, process.env.DEMO_DINER_ADDRESS ?? "House 14, Street 32, Walton Road");
  const address2 = page.locator("#addressLine2");
  if ((await address2.count()) && (await address2.inputValue())) await rec.retype(address2, "Near Walton Park");
  await rec.scrollBy(560, 1400);
  await rec.caption(C, "Cash, card or JazzCash, plus tips and order notes");
  const cod = page.getByText(/cash on delivery/i).first();
  if (await cod.count()) await rec.click(cod, { pauseAfter: 900 });
  const notes = page.locator("#notes");
  if (await notes.count()) await rec.type(notes, "Please ring the bell, thank you!", { delay: 40 });
  await rec.scrollBy(500, 1200);
  await rec.hold(900);
  const place = page.getByRole("button", { name: /place order/i });
  await rec.moveToLocator(place);
  await rec.hold(500);
  rec.mark("place");
  await rec.offCamera(async () => {
    await place.click();
    await page.waitForURL(/\/order\//, { timeout: 45000 });
  }, 1600);
  const orderUrl = page.url();
  const orderNumber = decodeURIComponent(orderUrl.split("/order/")[1]!.split("?")[0]!);
  console.log("order placed:", orderNumber);
  rec.mark("tracking");
  await rec.caption(C, `Order ${orderNumber} placed: the customer can follow it live`);
  await rec.moveTo(1200, 520, 900);
  await rec.hold(2600);
  await rec.scrollBy(420, 1300);
  await rec.hold(1800);
  rec.mark("tracking-end");

  // ── admin ──
  await rec.caption(A, null);
  await rec.card(chapterCard("Part 2 · The restaurant", "Behind the counter", `The same order, ${orderNumber}, handled by the restaurant team.`), 3600);
  rec.pause();
  await signInAdmin();
  await rec.goto(`${BASE}/admin`, 900);
  rec.mark("admin");
  await rec.caption(A, "The dashboard: today's orders, revenue and what needs attention");
  await rec.moveTo(900, 420, 900);
  await rec.hold(2600);
  await rec.scrollBy(500, 1400);
  await rec.hold(1600);

  // the order went to the branch serving the chosen area: switch the admin's branch scope to it, on camera
  const branchSelect = page.getByLabel("Branch").first();
  if (process.env.DEMO_BRANCH && (await branchSelect.count())) {
    const branchName = process.env.DEMO_BRANCH ?? "";
    const options = await branchSelect.evaluate((el) => Array.from((el as HTMLSelectElement).options).map((o) => o.text));
    const target = options.find((label) => label.toLowerCase().includes(branchName.toLowerCase()));
    if (target && !(await branchSelect.evaluate((el) => (el as HTMLSelectElement).selectedOptions[0]?.text ?? "")).includes(target)) {
      await rec.caption(A, "Multi-branch: switch between branches in one click");
      await rec.click(branchSelect, { pauseAfter: 300 });
      await rec.offCamera(() => branchSelect.selectOption({ label: target }).then(() => page.waitForTimeout(1500)), 900);
      await rec.hold(1500);
    }
  }

  await rec.goto(`${BASE}/admin/orders`, 700);
  rec.mark("orders");
  await rec.caption(A, "New orders arrive instantly, with a sound alert for staff");
  // the table row (the order number also exists in hidden markup, e.g. the sound-alert bookkeeping)
  const row = page.locator("tbody tr", { hasText: orderNumber }).first();
  const rowLink = row.getByRole("link").first();
  await rec.moveToLocator(row.getByText(orderNumber).first());
  await rec.hold(1600);
  await rec.offCamera(() => rowLink.click().then(() => page.waitForURL(new RegExp(orderNumber))), 800);
  await rec.caption(A, "Every detail in one place: items, add-ons, customer and payment");
  await rec.hold(1800);
  await rec.scrollBy(450, 1300);
  await rec.hold(1500);
  await rec.scrollBy(-450, 1000);
  const confirm = page.getByRole("button", { name: /mark confirmed/i }).first();
  await rec.caption(A, "Confirm the order in one click");
  await rec.click(confirm, { pauseAfter: 2200 });

  // ── kitchen board ──
  await rec.goto(`${BASE}/admin/kitchen`, 700);
  rec.mark("kitchen");
  await rec.caption(A, "The kitchen display: tickets move from New to Preparing to Ready");
  await rec.hold(1500);
  const ticket = () => page.locator("article", { hasText: orderNumber }).first();
  for (const step of [/start preparing/i, /mark ready/i, /out for delivery/i]) {
    const button = ticket().getByRole("button", { name: step });
    if (!(await button.count())) break;
    await rec.click(button, { pauseAfter: 2600 });
  }
  rec.mark("kitchen-end");

  // ── back to the customer: live status ──
  await rec.goto(orderUrl, 900);
  rec.mark("customer-live");
  await rec.caption(C, "Meanwhile, the customer sees every step as it happens");
  await rec.moveTo(1150, 480, 900);
  await rec.hold(3200);
  rec.mark("customer-live-end");

  // ── admin tour ──
  await rec.goto(`${BASE}/admin/menu`, 700);
  rec.mark("menu-admin");
  await rec.caption(A, "Menu management: dishes, photos, sizes, add-ons and availability");
  await rec.hold(1800);
  await rec.scrollBy(600, 1600);
  await rec.hold(1400);

  await rec.goto(`${BASE}/admin/reservations`, 700);
  await rec.caption(A, "Table reservations, confirmed and tracked by the team");
  await rec.hold(2600);

  await rec.goto(`${BASE}/admin/reports`, 900);
  rec.mark("reports");
  await rec.caption(A, "Sales reports: revenue, best-sellers and order trends");
  await rec.hold(1800);
  await rec.scrollBy(600, 1600);
  await rec.hold(1800);
  rec.mark("reports-end");

  await rec.goto(`${BASE}/admin/payments`, 700);
  await rec.caption(A, "Payments: online and cash, reconciled per order");
  await rec.hold(2400);

  await rec.goto(`${BASE}/admin/locations`, 700);
  await rec.caption(A, "Multiple branches, each with its own hours, zones and team");
  await rec.hold(2600);

  await rec.caption(A, null);
} catch (error) {
  if (!(error instanceof Error && error.message === "__stop__")) {
    console.error("recording stopped:", error instanceof Error ? error.message : error);
    await page.screenshot({ path: `${outDir}/error.png` }).catch(() => {});
  }
}

rec.mark("outro");
await rec.card(outroCard(), 6500);
rec.mark("end");
const timeline = await rec.finish();
console.log(`recorded ${timeline.frames.length} frames, ${timeline.end.toFixed(1)}s; marks: ${Object.keys(timeline.marks).join(", ")}`);
