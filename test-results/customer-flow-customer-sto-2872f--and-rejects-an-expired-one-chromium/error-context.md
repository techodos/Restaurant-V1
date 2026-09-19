# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: customer-flow.spec.ts >> customer storefront >> applies a real promo code and rejects an expired one
- Location: e2e/customer-flow.spec.ts:40:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/WELCOME10 applied/i)
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" getByText(/WELCOME10 applied/i) with timeout 10000ms
  - waiting for getByText(/WELCOME10 applied/i)

```

```yaml
- link "Skip to content":
  - /url: "#main"
- banner:
  - text: Free delivery on orders over Rs 3,000 within Gulberg & DHA
  - link "Order now":
    - /url: /r/bella-napoli/menu
  - link "Bella Napoli home":
    - /url: /r/bella-napoli
    - text: Bella Napoli
  - navigation "Main":
    - link "Home":
      - /url: /r/bella-napoli
    - link "Menu":
      - /url: /r/bella-napoli/menu
    - link "Reservations":
      - /url: /r/bella-napoli/reservation
    - link "Reviews":
      - /url: /r/bella-napoli/reviews
    - link "Locations":
      - /url: /r/bella-napoli/locations
  - link "+92 42 3577 8899":
    - /url: tel:+924235778899
  - link "Order online 1 item in cart":
    - /url: /r/bella-napoli/cart
    - text: Order online 1
- main:
  - heading "Your cart" [level=1]
  - paragraph: 1 item · prices confirmed by the kitchen when you place the order
  - paragraph: How would you like your order?
  - group "Order type":
    - button "Delivery" [pressed]
    - button "Pickup"
    - button "Dine-in"
  - paragraph: Gulberg & Garden Town · delivery RS 100.00 · free over RS 3,000.00 · minimum RS 800.00
  - list:
    - listitem:
      - paragraph:
        - link "Gulab Jamun":
          - /url: /r/bella-napoli/menu/gulab-jamun
      - paragraph: 2 pieces
      - paragraph: RS 350.00
      - button "Decrease quantity of Gulab Jamun"
      - text: "1"
      - button "Increase quantity of Gulab Jamun"
      - button "Remove"
  - link "← Add more items":
    - /url: /r/bella-napoli/menu
  - text: Promo code
  - textbox "Promo code":
    - /placeholder: WELCOME10
    - text: WELCOME10
  - button "Apply"
  - button "Empty cart"
  - complementary:
    - heading "Order summary" [level=2]
    - paragraph: We cannot price this cart yet — see the note below.
    - list:
      - listitem: Your order is below the minimum order amount.
    - button "Checkout" [disabled]
    - paragraph: Delivery details are collected at checkout.
    - paragraph: "House minimum: RS 500.00"
- contentinfo:
  - paragraph: Bella Napoli
  - paragraph: Wood-fired pizza, fresh pasta and dolci — made in Lahore since 2014.
  - list:
    - listitem:
      - link "Instagram":
        - /url: https://instagram.com/bellanapoli.pk
    - listitem:
      - link "Facebook":
        - /url: https://facebook.com/bellanapoli.pk
  - paragraph: Explore
  - list:
    - listitem:
      - link "Menu":
        - /url: /r/bella-napoli/menu
    - listitem:
      - link "Reservations":
        - /url: /r/bella-napoli/reservation
    - listitem:
      - link "Reviews":
        - /url: /r/bella-napoli/reviews
    - listitem:
      - link "Locations":
        - /url: /r/bella-napoli/locations
  - paragraph: Visit
  - list:
    - listitem:
      - link "Gulberg Flagship":
        - /url: /r/bella-napoli/locations
    - listitem:
      - link "DHA Phase 5":
        - /url: /r/bella-napoli/locations
  - paragraph: Visit us
  - text: 24-C, M.M. Alam Road, Gulberg III, Lahore Today 12pm – 1am
  - link "+92 42 3577 8899":
    - /url: tel:+924235778899
  - link "hello@bellanapoli.pk":
    - /url: mailto:hello@bellanapoli.pk
  - paragraph: © 2026 Bella Napoli Restaurants (Pvt) Ltd. All rights reserved.
  - paragraph: Prices include applicable taxes shown at checkout.
- region "Notifications alt+T"
- alert
```

# Test source

```ts
  1   | import { expect, test } from "@playwright/test";
  2   | 
  3   | const SLUG = "bella-napoli";
  4   | 
  5   | test.describe("customer storefront", () => {
  6   |   test("home page renders database-driven sections", async ({ page }) => {
  7   |     await page.goto(`/r/${SLUG}`);
  8   |     await expect(page.getByRole("heading", { level: 1 })).toContainText("Naples in the heart of Lahore");
  9   |     await expect(page.getByRole("heading", { name: "Guest favourites" })).toBeVisible();
  10  |     await expect(page.getByRole("heading", { name: "What our guests say" })).toBeVisible();
  11  |     await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Menu" })).toBeVisible();
  12  |     // the announcement bar is website config, not markup
  13  |     await expect(page.getByText(/Free delivery on orders over/i)).toBeVisible();
  14  |   });
  15  | 
  16  |   test("customising an item prices it exactly as the database says and adds it to the cart", async ({ page }) => {
  17  |     await page.goto(`/r/${SLUG}/menu/margherita-pizza`);
  18  |     await expect(page.getByRole("heading", { name: "Margherita Pizza" })).toBeVisible();
  19  | 
  20  |     await page.getByRole("radio", { name: /Medium 12"/ }).check();
  21  |     await page.getByRole("checkbox", { name: /Extra mozzarella/ }).check();
  22  |     await page.getByTestId("quantity-increase").click();
  23  | 
  24  |     // (1250 + 200) × 2 = 2900 — live estimate from the same Decimal math
  25  |     await expect(page.getByTestId("add-to-cart")).toContainText("2,900");
  26  |     await page.getByTestId("add-to-cart").click();
  27  |     await expect(page.getByText(/added$/i)).toBeVisible();
  28  | 
  29  |     await page.goto(`/r/${SLUG}/cart`);
  30  |     await expect(page.getByRole("heading", { name: "Your cart" })).toBeVisible();
  31  |     await expect(page.getByText("Margherita Pizza")).toBeVisible();
  32  |     await expect(page.getByText("Medium 12")).toBeVisible();
  33  |     await expect(page.getByText("+ Extra mozzarella")).toBeVisible();
  34  | 
  35  |     // server-side repricing: 2 × (1250 + 200) = 2,900 subtotal
  36  |     const subtotalRow = page.locator("dl div", { has: page.getByText("Subtotal") }).first();
  37  |     await expect(subtotalRow).toContainText("2,900");
  38  |   });
  39  | 
  40  |   test("applies a real promo code and rejects an expired one", async ({ page }) => {
  41  |     await page.goto(`/r/${SLUG}/menu`);
  42  |     await page.getByTestId("quick-add-gulab-jamun").first().click();
  43  |     await expect(page.getByText(/added$/i)).toBeVisible();
  44  | 
  45  |     await page.goto(`/r/${SLUG}/cart`);
  46  | 
  47  |     // expired coupon: the expiry date lives in the database
  48  |     await page.getByLabel("Promo code").fill("RAMADAN15");
  49  |     await page.getByRole("button", { name: "Apply" }).click();
  50  |     await expect(page.getByText(/expired|not valid/i)).toBeVisible();
  51  | 
  52  |     await page.getByLabel("Promo code").fill("WELCOME10");
  53  |     await page.getByRole("button", { name: "Apply" }).click();
> 54  |     await expect(page.getByText(/WELCOME10 applied/i)).toBeVisible();
      |                                                        ^ Error: expect(locator).toBeVisible() failed
  55  | 
  56  |     // the discount is then visible in the server-computed summary
  57  |     await expect(page.getByText(/Discount \(WELCOME10\)/)).toBeVisible();
  58  |   });
  59  | 
  60  |   test("places a guest order and tracks it from order_status_history", async ({ page }) => {
  61  |     await page.goto(`/r/${SLUG}/menu`);
  62  |     await page.getByTestId("quick-add-gulab-jamun").first().click();
  63  |     await expect(page.getByText(/added$/i)).toBeVisible();
  64  | 
  65  |     await page.goto(`/r/${SLUG}/checkout`);
  66  |     const delivery = page.getByRole("button", { name: "Delivery", exact: true });
  67  |     await delivery.click();
  68  |     await expect(delivery).toHaveAttribute("aria-pressed", "true");
  69  |     await page.getByLabel("Full name").fill("E2E Guest");
  70  |     await page.getByLabel("Phone").fill("+92 300 7770001");
  71  |     await page.getByLabel("Street address").fill("42 E2E Street");
  72  |     await page.getByLabel("Area").fill("Gulberg");
  73  | 
  74  |     await page.getByTestId("place-order").click();
  75  |     await expect(page.getByText("Order received")).toBeVisible({ timeout: 25_000 });
  76  | 
  77  |     const heading = await page.getByRole("heading", { level: 1 }).textContent();
  78  |     expect(heading).toMatch(/ORD-\d{4}-\d{5}/);
  79  | 
  80  |     // the timeline is the audit trail written by the database trigger
  81  |     await expect(page.getByText("Pending")).toBeVisible();
  82  |     await expect(page.getByText("Confirmed")).toBeVisible();
  83  |     await expect(page.getByText(/Estimated in about|Arriving any moment|Behind schedule/)).toBeVisible();
  84  |     await expect(page.getByText("Your items")).toBeVisible();
  85  |   });
  86  | 
  87  |   test("books a table against real opening hours and capacity", async ({ page }) => {
  88  |     await page.goto(`/r/${SLUG}/reservation`);
  89  |     await expect(page.getByRole("heading", { name: /Book a table/ })).toBeVisible();
  90  | 
  91  |     // pick a few days out so earlier runs' bookings cannot exhaust the slots
  92  |     await page.getByLabel("Date").selectOption({ index: 3 });
  93  | 
  94  |     const freeSlots = page.locator("button[data-testid^='slot-']:not([disabled])");
  95  |     await expect(freeSlots.first()).toBeVisible({ timeout: 15_000 });
  96  |     const slotTime = await freeSlots.first().getAttribute("data-testid");
  97  |     await freeSlots.first().click();
  98  |     // aria-pressed only flips once React is hydrated — submitting before that
  99  |     // would send a native GET instead of calling the server action
  100 |     await expect(freeSlots.first()).toHaveAttribute("aria-pressed", "true");
  101 | 
  102 |     await page.getByLabel("Name").fill("E2E Diners");
  103 |     await page.getByLabel("Phone").fill("+92 300 7770002");
  104 |     await page.getByTestId("request-table").click();
  105 | 
  106 |     await expect(page.getByText(/Your table is confirmed|Booking received/)).toBeVisible({ timeout: 25_000 });
  107 |     await expect(page.getByText(/^[A-Z0-9]{6,}$/).first()).toBeVisible({ timeout: 5_000 });
  108 |     expect(slotTime).toMatch(/^slot-\d{2}:\d{2}$/);
  109 |   });
  110 | 
  111 |   test("shows only approved reviews with a real rating breakdown", async ({ page }) => {
  112 |     await page.goto(`/r/${SLUG}/reviews`);
  113 |     await expect(page.getByRole("heading", { name: "Guest reviews" })).toBeVisible();
  114 |     await expect(page.getByText(/verified review/i).first()).toBeVisible();
  115 |     await expect(page.getByText("Featured").first()).toBeVisible();
  116 |   });
  117 | 
  118 |   test("an unknown restaurant slug returns a 404 instead of an empty site", async ({ page }) => {
  119 |     const response = await page.goto("/r/not-a-restaurant");
  120 |     expect(response?.status()).toBe(404);
  121 |     await expect(page.getByText(/could not find that page/i)).toBeVisible();
  122 |   });
  123 | });
  124 | 
```