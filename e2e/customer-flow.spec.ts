import { expect, test } from "@playwright/test";

const SLUG = "bella-napoli";

test.describe("customer storefront", () => {
  test("home page renders database-driven sections", async ({ page }) => {
    await page.goto(`/r/${SLUG}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Naples in the heart of Lahore");
    await expect(page.getByRole("heading", { name: "Guest favourites" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "What our guests say" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Menu" })).toBeVisible();
    // the announcement bar is website config, not markup
    await expect(page.getByText(/Free delivery on orders over/i)).toBeVisible();
  });

  test("customising an item prices it exactly as the database says and adds it to the cart", async ({ page }) => {
    await page.goto(`/r/${SLUG}/menu/margherita-pizza`);
    await expect(page.getByRole("heading", { name: "Margherita Pizza" })).toBeVisible();

    await page.getByRole("radio", { name: /Medium 12"/ }).check();
    await page.getByRole("checkbox", { name: /Extra mozzarella/ }).check();
    await page.getByTestId("quantity-increase").click();

    // (1250 + 200) × 2 = 2900 — live estimate from the same Decimal math
    await expect(page.getByTestId("add-to-cart")).toContainText("2,900");
    await page.getByTestId("add-to-cart").click();
    await expect(page.getByText(/added$/i)).toBeVisible();

    await page.goto(`/r/${SLUG}/cart`);
    await expect(page.getByRole("heading", { name: "Your cart" })).toBeVisible();
    await expect(page.getByText("Margherita Pizza")).toBeVisible();
    await expect(page.getByText("Medium 12")).toBeVisible();
    await expect(page.getByText("+ Extra mozzarella")).toBeVisible();

    // server-side repricing: 2 × (1250 + 200) = 2,900 subtotal
    const subtotalRow = page.locator("dl div", { has: page.getByText("Subtotal") }).first();
    await expect(subtotalRow).toContainText("2,900");
  });

  test("applies a real promo code and rejects an expired one", async ({ page }) => {
    await page.goto(`/r/${SLUG}/menu`);
    await page.getByTestId("quick-add-gulab-jamun").first().click();
    await expect(page.getByText(/added$/i)).toBeVisible();

    await page.goto(`/r/${SLUG}/cart`);

    // expired coupon: the expiry date lives in the database
    await page.getByLabel("Promo code").fill("RAMADAN15");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText(/expired|not valid/i)).toBeVisible();

    await page.getByLabel("Promo code").fill("WELCOME10");
    await page.getByRole("button", { name: "Apply" }).click();
    await expect(page.getByText(/WELCOME10 applied/i)).toBeVisible();

    // the discount is then visible in the server-computed summary
    await expect(page.getByText(/Discount \(WELCOME10\)/)).toBeVisible();
  });

  test("places a guest order and tracks it from order_status_history", async ({ page }) => {
    await page.goto(`/r/${SLUG}/menu`);
    await page.getByTestId("quick-add-gulab-jamun").first().click();
    await expect(page.getByText(/added$/i)).toBeVisible();

    await page.goto(`/r/${SLUG}/checkout`);
    const delivery = page.getByRole("button", { name: "Delivery", exact: true });
    await delivery.click();
    await expect(delivery).toHaveAttribute("aria-pressed", "true");
    await page.getByLabel("Full name").fill("E2E Guest");
    await page.getByLabel("Phone").fill("+92 300 7770001");
    await page.getByLabel("Street address").fill("42 E2E Street");
    await page.getByLabel("Area").fill("Gulberg");

    await page.getByTestId("place-order").click();
    await expect(page.getByText("Order received")).toBeVisible({ timeout: 25_000 });

    const heading = await page.getByRole("heading", { level: 1 }).textContent();
    expect(heading).toMatch(/ORD-\d{4}-\d{5}/);

    // the timeline is the audit trail written by the database trigger
    await expect(page.getByText("Pending")).toBeVisible();
    await expect(page.getByText("Confirmed")).toBeVisible();
    await expect(page.getByText(/Estimated in about|Arriving any moment|Behind schedule/)).toBeVisible();
    await expect(page.getByText("Your items")).toBeVisible();
  });

  test("books a table against real opening hours and capacity", async ({ page }) => {
    await page.goto(`/r/${SLUG}/reservation`);
    await expect(page.getByRole("heading", { name: /Book a table/ })).toBeVisible();

    // pick a few days out so earlier runs' bookings cannot exhaust the slots
    await page.getByLabel("Date").selectOption({ index: 3 });

    const freeSlots = page.locator("button[data-testid^='slot-']:not([disabled])");
    await expect(freeSlots.first()).toBeVisible({ timeout: 15_000 });
    const slotTime = await freeSlots.first().getAttribute("data-testid");
    await freeSlots.first().click();
    // aria-pressed only flips once React is hydrated — submitting before that
    // would send a native GET instead of calling the server action
    await expect(freeSlots.first()).toHaveAttribute("aria-pressed", "true");

    await page.getByLabel("Name").fill("E2E Diners");
    await page.getByLabel("Phone").fill("+92 300 7770002");
    await page.getByLabel("Email").fill("e2e-diners@example.com");
    await page.getByTestId("request-table").click();

    await expect(page.getByText(/Your table is confirmed|Request submitted successfully/)).toBeVisible({ timeout: 25_000 });
    await expect(page.getByText(/^[A-Z0-9]{6,}$/).first()).toBeVisible({ timeout: 5_000 });
    expect(slotTime).toMatch(/^slot-\d{2}:\d{2}$/);
  });

  test("shows only approved reviews with a real rating breakdown", async ({ page }) => {
    await page.goto(`/r/${SLUG}/reviews`);
    await expect(page.getByRole("heading", { name: "Guest reviews" })).toBeVisible();
    await expect(page.getByText(/verified review/i).first()).toBeVisible();
    await expect(page.getByText("Featured").first()).toBeVisible();
  });

  test("an unknown restaurant slug returns a 404 instead of an empty site", async ({ page }) => {
    const response = await page.goto("/r/not-a-restaurant");
    expect(response?.status()).toBe(404);
    await expect(page.getByText(/could not find that page/i)).toBeVisible();
  });
});
