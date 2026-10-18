import { expect, test } from "@playwright/test";
import { auditLayout } from "./support/layout-audit";

/**
 * Responsive layout guard: every route at phone → desktop widths must have no page overflow, no element
 * escaping the viewport, no control clipped by its container, no overlapping controls and no cut-off text
 * (rules in support/layout-audit.ts). Read-only (GET pages only), so it is safe against any database.
 *
 *   E2E_BASE_URL=http://localhost:3100 npx playwright test e2e/responsive.spec.ts
 *
 * Optional, to cover more routes:
 *   E2E_ITEM_SLUG=<menu item slug>            dish page
 *   E2E_ADMIN_COOKIE=<rp_admin_session JWT>   restaurant admin (+ E2E_ADMIN_ORDER, E2E_ADMIN_ITEM_ID, E2E_ADMIN_CUSTOMER_ID)
 *   E2E_SUPER_ADMIN_COOKIE=<rp_super_admin_session JWT> + E2E_SUPER_ADMIN_SLUG   super admin
 *   E2E_WIDTHS=320,375                        a subset of widths
 */

const WIDTHS = (process.env.E2E_WIDTHS ?? "320,375,430,768,1024,1280,1440").split(",").map(Number);
const env = process.env;

const storefront = [
  "/", "/menu", "/cart", "/orders", "/current-orders", "/reservation", "/reviews", "/locations",
  "/privacy", "/terms", "/account/sign-in", "/account/sign-up", "/no-such-page",
  ...(env.E2E_ITEM_SLUG ? [`/menu/${env.E2E_ITEM_SLUG}`] : []),
  ...(env.E2E_EXTRA_ROUTES ? env.E2E_EXTRA_ROUTES.split(",") : []),
];
const admin = env.E2E_ADMIN_COOKIE
  ? [
      "/admin", "/admin/orders", "/admin/kitchen", "/admin/menu", "/admin/menu/items/new", "/admin/reservations",
      "/admin/reviews", "/admin/payments", "/admin/customers", "/admin/reports", "/admin/coupons", "/admin/delivery-zones",
      "/admin/locations", "/admin/settings", "/admin/staff",
      ...(env.E2E_ADMIN_ORDER ? [`/admin/orders/${env.E2E_ADMIN_ORDER}`] : []),
      ...(env.E2E_ADMIN_ITEM_ID ? [`/admin/menu/items/${env.E2E_ADMIN_ITEM_ID}`] : []),
      ...(env.E2E_ADMIN_CUSTOMER_ID ? [`/admin/customers/${env.E2E_ADMIN_CUSTOMER_ID}`] : []),
    ]
  : [];
const superAdmin =
  env.E2E_SUPER_ADMIN_COOKIE && env.E2E_SUPER_ADMIN_SLUG
    ? ["/super-admin", `/super-admin/${env.E2E_SUPER_ADMIN_SLUG}`, `/super-admin/${env.E2E_SUPER_ADMIN_SLUG}/website`]
    : [];

test.use({ reducedMotion: "reduce" }); // scroll-reveal sections are otherwise measured at opacity 0

for (const route of [...storefront, "/admin/login", ...admin, ...superAdmin]) {
  test(`layout ${route}`, async ({ browser, baseURL }) => {
    test.setTimeout(60_000 + WIDTHS.length * 30_000);
    const failures: string[] = [];
    for (const width of WIDTHS) {
      const phone = width < 600;
      const context = await browser.newContext({ viewport: { width, height: phone ? 812 : 900 }, isMobile: phone, hasTouch: width < 1024, reducedMotion: "reduce" });
      const host = new URL(baseURL!).hostname;
      const cookies = [
        env.E2E_ADMIN_COOKIE && { name: "rp_admin_session", value: env.E2E_ADMIN_COOKIE, domain: host, path: "/" },
        env.E2E_SUPER_ADMIN_COOKIE && { name: "rp_super_admin_session", value: env.E2E_SUPER_ADMIN_COOKIE, domain: host, path: "/" },
      ].filter(Boolean) as { name: string; value: string; domain: string; path: string }[];
      if (cookies.length) await context.addCookies(cookies);
      const page = await context.newPage();
      // "load", not "networkidle": live order streams and dev HMR keep connections open
      await page.goto(route, { waitUntil: "load" });
      await page.waitForTimeout(1500);
      // walk the page once so lazy images and client widgets have rendered
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 30)); }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(300);
      for (const defect of await auditLayout(page)) failures.push(`${width}px  ${defect}`);
      await context.close();
    }
    expect(failures, `layout defects on ${route}`).toEqual([]);
  });
}
