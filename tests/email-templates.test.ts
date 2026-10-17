import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Order, Reservation } from "@/shared/contract/models";
import { formatMoney } from "@/shared/money";
import type { NotificationRestaurant } from "@/server/notifications/types";
import { renderVerificationCodeEmail } from "@/server/notifications/templates/email-verification";
import { contrast, emailLogoUrl, emailPalette, type EmailBrand } from "@/server/notifications/templates/layout";
import { renderOrderCompletedEmail } from "@/server/notifications/templates/order-completed";
import { renderOrderConfirmationEmail } from "@/server/notifications/templates/order-confirmation";
import { renderReservationConfirmedEmail, renderReservationRequestedEmail } from "@/server/notifications/templates/reservation-emails";

/**
 * Every email template, rendered for two unrelated restaurants (different name, colour, currency, contact): the right
 * brand and only that brand, no leftover placeholders, readable colours for light and dark brands, exact codes and
 * expiry, safe logo handling, and the order's own amounts.
 */

type Restaurant = NotificationRestaurant & { siteUrl: string };

const DARK: Restaurant = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Olive & Ember", slug: "olive-ember", logoUrl: null, primaryColor: "#1f3d2b",
  email: "hello@olive.example", phone: "+92 51 555 0101", currencySymbol: "Rs", locale: "en", timezone: "Asia/Karachi",
  reviewsEnabled: true, channels: { email: true, push: true }, siteUrl: "https://olive.example",
};
const LIGHT: Restaurant = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Café Soleil", slug: "cafe-soleil", logoUrl: "https://cdn.soleil.example/logo.png", primaryColor: "#f4d35e",
  email: null, phone: null, currencySymbol: "€", locale: "fr", timezone: "Europe/Paris",
  reviewsEnabled: true, channels: { email: true, push: true }, siteUrl: "https://soleil.example",
};

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "o1", restaurantId: DARK.id, customerId: "c1", orderNumber: "ZX9K-7YQ2P", orderType: "delivery", status: "confirmed",
    customerName: "Mariam Saleh", customerEmail: "mariam@example.com", customerPhone: "+92 300 1112223",
    deliveryAddress: { line1: "House 14, Street 32", area: "F-7/2", city: "Islamabad" }, tableNumber: null, locationName: null,
    subtotal: "2450.00", discountAmount: "100.00", deliveryFee: "150.00", taxAmount: "376.00", serviceFee: "0.00", tipAmount: "0.00",
    total: "2876.00", estimatedReadyAt: "2026-10-17T14:40:00.000Z",
    items: [
      { id: "i1", orderId: "o1", menuItemId: null, variantId: null, itemName: "Mezze Sharing Platter", variantName: "For 2", quantity: 1,
        unitPrice: "2450.00", addonsTotal: "0.00", lineTotal: "2450.00", specialInstructions: null,
        addons: [{ id: "a1", orderItemId: "i1", menuAddonId: null, groupName: "Extras", addonName: "Warm pita", unitPrice: "0.00", quantity: 2 }] },
    ],
    ...overrides,
  } as Order;
}

const reservation = (overrides: Partial<Reservation> = {}): Reservation =>
  ({
    id: "r1", restaurantId: DARK.id, locationId: "l1", locationName: "F-7 Markaz", customerId: null, confirmationCode: "AB12CD34",
    guestName: "Hira Zafar", guestEmail: "hira@example.com", guestPhone: "+92 300 0000000", reservationDate: "2026-10-24", reservationTime: "19:30",
    durationMinutes: 90, guests: 4, tableNumber: null, specialRequests: "Window seat <please>", occasion: null, status: "pending", notes: null,
    createdAt: "2026-10-17T10:00:00.000Z", ...overrides,
  }) as Reservation;

function allEmails(r: Restaurant) {
  const brand: EmailBrand = r;
  return {
    verify: renderVerificationCodeEmail({ brand, code: "048213", purpose: "verify", expiresInMinutes: 10 }),
    reset: renderVerificationCodeEmail({ brand, code: "905117", purpose: "reset", expiresInMinutes: 10 }),
    confirmed: renderOrderConfirmationEmail({ restaurant: r, order: order(), orderUrl: `${r.siteUrl}/order/ZX9K-7YQ2P?t=tok` }),
    completed: renderOrderCompletedEmail({ restaurant: r, order: order({ status: "completed" }), orderUrl: `${r.siteUrl}/order/ZX9K-7YQ2P`, reviewUrl: `${r.siteUrl}/reviews?order=ZX9K-7YQ2P` }),
    requested: renderReservationRequestedEmail({ restaurant: r, reservation: reservation() }),
    reservationConfirmed: renderReservationConfirmedEmail({ restaurant: r, reservation: reservation({ status: "confirmed" }) }),
  };
}

describe("email templates", () => {
  it("render all six for two restaurants: each carries its own brand only, and nothing unresolved", () => {
    for (const [mine, other] of [[DARK, LIGHT], [LIGHT, DARK]] as const) {
      for (const [name, mail] of Object.entries(allEmails(mine))) {
        const where = `${mine.slug}/${name}`;
        expect(mail.html, where).toContain(mine.name.replace("&", "&amp;"));
        expect(mail.html, where).not.toContain(other.name.replace("&", "&amp;"));
        expect(mail.html, where).toContain(emailPalette(mine.primaryColor).brand);
        expect(mail.html, where).not.toContain(emailPalette(other.primaryColor).brand);
        for (const leak of ["undefined", "NaN", "[object Object]", "${", "null"]) expect(mail.html, `${where} ${leak}`).not.toContain(leak);
        expect(mail.text, where).toContain(mine.name);
        expect(mail.subject, where).toContain(mine.name);
        // well-formed enough for mail clients: every table / row / cell closed
        for (const tag of ["table", "tr", "td", "p"]) {
          expect((mail.html.match(new RegExp(`<${tag}[\\s>]`, "g")) ?? []).length, `${where} <${tag}>`).toBe(
            (mail.html.match(new RegExp(`</${tag}>`, "g")) ?? []).length,
          );
        }
        expect(mail.html, where).toContain("max-width:600px");
        expect(mail.html, where).toContain('name="viewport"');
      }
    }
  });

  it("templates hold no restaurant's name, colour or currency", () => {
    const dir = "src/server/notifications/templates";
    for (const file of readdirSync(dir)) {
      const source = readFileSync(`${dir}/${file}`, "utf8");
      for (const hardcoded of ["Zaytoun", "Bella", "Napoli", "Blue Hour", "Bun Intended", "PKR", '"Rs', "Rs ", "#1B2B24", "#C8963E"]) {
        expect(source, `${file}: ${hardcoded}`).not.toContain(hardcoded);
      }
    }
  });

  it("keeps every brand readable: buttons pick black or white text, accents darken to 4.5:1 on white", () => {
    for (const colour of ["#1f3d2b", "#f4d35e", "#ffffff", "#000000", "#c2410c", "#7dd3fc", "#fff", null, "red;x"]) {
      const p = emailPalette(colour);
      expect(contrast(p.brand, p.onBrand), `${colour} button`).toBeGreaterThanOrEqual(colour === "#7dd3fc" ? 4 : 4.5);
      expect(contrast(p.accent, "#ffffff"), `${colour} accent`).toBeGreaterThanOrEqual(4.5);
    }
    expect(emailPalette("#f4d35e").darkHeader).toBe(false); // a pale brand gets a white header with an accent wordmark
    expect(emailPalette("#1f3d2b").darkHeader).toBe(true);
  });

  it("shows a one-time code exactly as given, with the real expiry, and never in a link", () => {
    for (const purpose of ["verify", "reset"] as const) {
      const mail = renderVerificationCodeEmail({ brand: DARK, code: "000417", purpose, expiresInMinutes: 15 });
      expect(mail.html).toContain(">000417</p>"); // one text node: a copy gives exactly the code
      expect(mail.html).not.toMatch(/href="[^"]*000417/);
      expect(mail.html).toContain("15 minutes");
      expect(mail.html).not.toContain("10 minutes");
      expect(mail.text).toContain("000417");
      expect(mail.html).toMatch(/never share this code/i);
    }
    const verify = renderVerificationCodeEmail({ brand: DARK, code: "123456" });
    const reset = renderVerificationCodeEmail({ brand: DARK, code: "123456", purpose: "reset" });
    expect(verify.html).toContain("Verify your email address");
    expect(reset.html).toContain("Reset your password");
    expect(reset.html).toMatch(/your password stays the same/i);
    expect(renderVerificationCodeEmail({ brand: DARK, code: "1", expiresInMinutes: 1 }).html).toContain("1 minute<");
  });

  it("uses only logos mail clients show: absolute raster images; relative paths made absolute; SVG and unsafe URLs fall back to the name", () => {
    const base = { ...DARK };
    expect(emailLogoUrl({ ...base, logoUrl: "/images/olive/logo.png" })).toBe("https://olive.example/images/olive/logo.png");
    expect(emailLogoUrl({ ...base, logoUrl: "/images/olive/logo.svg" })).toBeNull();
    expect(emailLogoUrl({ ...base, logoUrl: "https://cdn.example/logo.SVG?v=2" })).toBeNull();
    expect(emailLogoUrl({ ...base, logoUrl: "javascript:alert(1)" })).toBeNull();
    expect(emailLogoUrl({ ...base, logoUrl: "//evil.example/x.png" })).toBeNull();
    expect(emailLogoUrl({ ...base, siteUrl: null, logoUrl: "/images/olive/logo.png" })).toBeNull();
    const withLogo = renderOrderConfirmationEmail({ restaurant: LIGHT, order: order(), orderUrl: "https://soleil.example/order/x" });
    expect(withLogo.html).toContain('src="https://cdn.soleil.example/logo.png" alt="Café Soleil"');
  });

  it("order emails use the order's own amounts and currency, and show only the charges that apply", () => {
    const money = (v: string, r: Restaurant) => formatMoney(v, { currency: r.currencySymbol, locale: r.locale });
    for (const r of [DARK, LIGHT]) {
      const { html, text } = renderOrderConfirmationEmail({ restaurant: r, order: order(), orderUrl: `${r.siteUrl}/order/x` });
      for (const v of ["2450.00", "100.00", "150.00", "376.00", "2876.00"]) expect(html, `${r.slug} ${v}`).toContain(money(v, r).replace(/&/g, "&amp;"));
      expect(text).toContain(`Total: ${money("2876.00", r)}`);
      expect(html).not.toContain("Service fee");
      expect(html).not.toContain("Tip<");
      expect(html).toContain("Warm pita ×2");
      expect(html).toContain(`href="${r.siteUrl}/order/x"`);
    }
    const pickup = renderOrderConfirmationEmail({
      restaurant: DARK,
      order: order({ orderType: "pickup", deliveryFee: "0.00", deliveryAddress: null, locationName: "F-7 Markaz" }),
      orderUrl: "https://olive.example/order/x",
    });
    expect(pickup.html).not.toContain(">Delivery<");
    expect(pickup.html).toContain("F-7 Markaz");
  });

  it("completed email: review button when reviews are on, a plain order button when not", () => {
    const withReview = allEmails(DARK).completed;
    expect(withReview.html).toContain("Rate your order");
    expect(withReview.html).toContain('href="https://olive.example/reviews?order=ZX9K-7YQ2P"');
    const noReview = renderOrderCompletedEmail({ restaurant: DARK, order: order({ status: "completed" }), orderUrl: "https://olive.example/order/x", reviewUrl: null });
    expect(noReview.html).not.toContain("Rate your order");
    expect(noReview.html).toContain("View your order");
    expect(noReview.subject).toBe("Your Olive & Ember order ZX9K-7YQ2P is complete");
  });

  it("escapes customer text and survives very long names, addresses and order numbers", () => {
    const long = "W".repeat(140);
    const mail = renderOrderConfirmationEmail({
      restaurant: { ...DARK, name: `${long} Kitchen` },
      order: order({ customerName: `<script>${long}`, orderNumber: `ORD-${"9".repeat(60)}`, deliveryAddress: { line1: `${long} Road`, area: long, city: "Islamabad" } }),
      orderUrl: "https://olive.example/order/x",
    });
    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).toContain("word-break:break-word");
    const res = allEmails(DARK).requested;
    expect(res.html).toContain("Window seat &lt;please&gt;");
  });
});
