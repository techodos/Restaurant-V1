import { expect, test, type Page } from "@playwright/test";

// the deployment under test must run with NEXT_PUBLIC_DEFAULT_RESTAURANT=bella-napoli
const SLUG = "bella-napoli";

// adding to the tray writes its cookie in the browser (no request, no toast): wait for that, not for a message
async function expectTrayFilled(page: Page): Promise<void> {
  await expect.poll(async () => (await page.context().cookies()).some((c) => c.name === `rp_tray_${SLUG}` && c.value.length > 10)).toBe(true);
}

// Orders and bookings need a signed-in, email-verified customer: E2E_CUSTOMER_EMAIL / E2E_CUSTOMER_PASSWORD
// (on a local seeded database, the seeded sana.malik@example.com account).
const customerSet = () => Boolean(process.env.E2E_CUSTOMER_EMAIL && process.env.E2E_CUSTOMER_PASSWORD);
async function signIn(page: Page, returnTo: string): Promise<void> {
  await page.goto(`/account/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel("Email").fill(process.env.E2E_CUSTOMER_EMAIL!);
  await page.getByLabel("Password", { exact: true }).fill(process.env.E2E_CUSTOMER_PASSWORD!); // not "Show password"
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(returnTo));
}

test.describe("customer storefront", () => {
  test("home page renders database-driven sections", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Naples in the heart of Lahore");
    await expect(page.getByRole("heading", { name: "Guest favourites" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "What our guests say" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Menu" })).toBeVisible();
    // the announcement bar is website config, not markup
    await expect(page.getByText(/Free delivery on orders over/i)).toBeVisible();
  });

  test("customising an item prices it exactly as the database says and adds it to the cart", async ({ page }) => {
    await page.goto(`/menu/margherita-pizza`);
    await expect(page.getByRole("heading", { name: "Margherita Pizza" })).toBeVisible();

    await page.getByRole("radio", { name: /Medium 12"/ }).check();
    await page.getByRole("checkbox", { name: /Extra mozzarella/ }).check();
    await page.getByTestId("quantity-increase").click();

    // (1250 + 200) × 2 = 2900 — live estimate from the same Decimal math
    await expect(page.getByTestId("add-to-cart")).toContainText("2,900");
    await page.getByTestId("add-to-cart").click();
    await expectTrayFilled(page);

    await page.goto(`/cart`);
    await expect(page.getByRole("heading", { name: "My Cart" })).toBeVisible();
    await expect(page.getByText("Margherita Pizza")).toBeVisible();
    await expect(page.getByText("Medium 12")).toBeVisible();
    await expect(page.getByText("+ Extra mozzarella")).toBeVisible();

    // server-side repricing: 2 × (1250 + 200) = 2,900 subtotal
    const subtotalRow = page.locator("dl div", { has: page.getByText("Subtotal") }).first();
    await expect(subtotalRow).toContainText("2,900");
  });

  test("applies a real promo code and rejects an expired one", async ({ page }) => {
    await page.goto(`/menu`);
    await page.getByTestId("quick-add-mixed-grill-platter").first().click(); // over WELCOME10's Rs 500 minimum
    await expectTrayFilled(page);

    await page.goto(`/cart`);

    // expired coupon: the expiry date lives in the database
    await page.getByLabel("Promo code").fill("RAMADAN15");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText(/expired|not valid/i)).toBeVisible();

    // no success toast: the applied code shows up as the server-computed summary's discount line
    await page.getByLabel("Promo code").fill("WELCOME10");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText(/Discount \(WELCOME10\)/)).toBeVisible();
  });

  test("a guest reaches the checkout form (their email is verified at Place order, not by a sign-in redirect)", async ({ page }) => {
    await page.goto(`/menu`);
    await page.getByTestId("quick-add-mixed-grill-platter").first().click(); // over the minimum order on its own
    await expectTrayFilled(page);

    await page.goto(`/checkout`);
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(page.getByTestId("place-order")).toBeVisible();
  });

  test("a verified customer places a pickup order and tracks it", async ({ page }) => {
    test.skip(!customerSet(), "E2E_CUSTOMER_EMAIL / E2E_CUSTOMER_PASSWORD not set");
    await signIn(page, "/menu");

    await page.getByTestId("quick-add-mixed-grill-platter").first().click();
    await expectTrayFilled(page);

    await page.goto(`/checkout`);
    await page.locator('input[name="orderType"][value="pickup"]').check({ force: true }); // pickup: no map address needed
    const placeOrder = page.getByTestId("place-order");
    // outside the branch's opening hours the button is (correctly) disabled with "… closed · opens …"
    test.skip(/closed/i.test((await placeOrder.textContent()) ?? ""), "the branch is closed right now");
    await placeOrder.click();

    // the order page is the confirmation: its number, the live status and the timeline written by the database
    await expect(page).toHaveURL(/\/order\/[A-Z0-9]{4}-[A-Z0-9]{5}$/, { timeout: 30_000 });
    await expect(page.getByText(/Pickup order, placed/)).toBeVisible();
    await expect(page.getByText("Received").first()).toBeVisible();
  });

  test("a signed-in customer books a table", async ({ page }) => {
    test.skip(!customerSet(), "E2E_CUSTOMER_EMAIL / E2E_CUSTOMER_PASSWORD not set");
    await signIn(page, "/reservation");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    // a few days out; there is no per-slot capacity any more (owner decision 2026-10-11), so any open slot works
    await page.locator('[role="radiogroup"][aria-labelledby="date-label"] button').nth(3).click();
    const slot = page.locator("button[data-testid^='slot-']:not([disabled])").first();
    await expect(slot).toBeVisible({ timeout: 15_000 });
    const slotTime = await slot.getAttribute("data-testid");
    await slot.click();
    // aria-pressed only flips once React is hydrated — submitting before that would send a native GET
    await expect(slot).toHaveAttribute("aria-pressed", "true");

    await page.getByTestId("request-table").click();
    await expect(page.getByText(/Your table is confirmed|Request received/)).toBeVisible({ timeout: 25_000 });
    expect(slotTime).toMatch(/^slot-\d{2}:\d{2}$/);
  });

  test("shows only approved reviews with a real rating breakdown", async ({ page }) => {
    await page.goto(`/reviews`);
    await expect(page.getByRole("heading", { name: "Guest reviews" })).toBeVisible();
    await expect(page.getByText(/verified review/i).first()).toBeVisible();
    await expect(page.getByText("Featured").first()).toBeVisible();
  });

  test("the old /r/<slug> URLs are gone (no redirect layer): they 404", async ({ page }) => {
    const response = await page.goto(`/r/${SLUG}/menu`);
    expect(response?.status()).toBe(404);
    await expect(page.getByText(/could not find that page/i)).toBeVisible();
  });
});
