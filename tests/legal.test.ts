import { describe, expect, it } from "vitest";
import { buildLegalDocument, legalDocumentSections, legalFactsFor, type LegalFactsInput, type LegalKind } from "@/shared/legal";
import { parseSections } from "@/shared/contract/sections";
import { restaurantFeaturesSchema, restaurantSettingsSchema } from "@/shared/contract/settings";
import { location, restaurant } from "./helpers/storefront-data";

function facts(overrides: Partial<LegalFactsInput> = {}) {
  return legalFactsFor({
    restaurant: restaurant(),
    primaryLocation: null,
    orderTypes: ["delivery", "pickup"],
    paymentMethods: ["cash_on_delivery", "cash"],
    onlineProvider: null,
    emailNotifications: true,
    pushNotifications: false,
    googleSignIn: false,
    maps: false,
    ...overrides,
  });
}

function text(kind: LegalKind, input: Partial<LegalFactsInput> = {}): string {
  const doc = buildLegalDocument(kind, facts(input));
  return [doc.title, doc.summary, ...doc.sections.flatMap((s) => [s.heading, ...s.paragraphs, ...(s.bullets ?? [])])].join("\n");
}

describe("legal documents are per restaurant", () => {
  const zaytoun = restaurant({
    id: "00000000-0000-4000-8000-000000000002",
    name: "Zaytoun",
    slug: "zaytoun",
    legalName: "Zaytoun Foods (Pvt) Ltd",
    email: "hello@zaytoun.pk",
    phone: "+92 51 1234567",
  });

  it.each<LegalKind>(["privacy", "terms"])("%s names only the restaurant it was built for", (kind) => {
    const own = text(kind, { restaurant: zaytoun, primaryLocation: location("f7", { addressLine1: "F-7 Markaz", city: "Islamabad" }) });
    expect(own).toContain("Zaytoun Foods (Pvt) Ltd");
    expect(own).toContain("hello@zaytoun.pk");
    expect(own).toContain("+92 51 1234567");
    expect(own).toContain("F-7 Markaz, Islamabad");
    expect(own).toContain("You can email hello@zaytoun.pk, call +92 51 1234567 or write to us at F-7 Markaz, Islamabad.");
    expect(own).not.toContain("Bella Napoli");

    const other = text(kind);
    expect(other).toContain("Bella Napoli");
    expect(other).not.toContain("Zaytoun");
  });

  it("the website contact email wins over the restaurant email, like the footer", () => {
    expect(text("privacy", { restaurant: zaytoun, contactEmail: "privacy@zaytoun.pk" })).toContain("privacy@zaytoun.pk");
    expect(text("privacy", { restaurant: zaytoun, contactEmail: "  " })).toContain("hello@zaytoun.pk");
  });

  it("falls back to the trading name and a generic contact line", () => {
    const doc = buildLegalDocument("terms", facts());
    const contact = doc.sections.find((section) => section.id === "contact");
    expect(contact?.paragraphs[0]).toContain("contact Bella Napoli.");
    expect(contact?.paragraphs[0]).toContain("contact details on our website");
  });

  it("writes the address once even when the area repeats addressLine2", () => {
    const branch = location("g", { addressLine1: "71-C, MM Alam Road, Gulberg III", addressLine2: "Gulberg III", area: "gulberg iii", city: "Lahore", postalCode: "54660" });
    expect(text("privacy", { primaryLocation: branch })).toContain("71-C, MM Alam Road, Gulberg III, Lahore, 54660.");
  });

  it("names the country instead of its ISO code", () => {
    expect(text("terms")).toContain("laws of Pakistan");
  });
});

describe("legal documents follow the restaurant's real features", () => {
  it("lists the payment methods and order types checkout offers", () => {
    const terms = text("terms", { orderTypes: ["pickup"], paymentMethods: ["cash", "card_terminal"] });
    expect(terms).toContain("online orders for pickup");
    expect(terms).toContain("We accept cash at the restaurant and card at the counter.");
    expect(terms).not.toContain("cash on delivery");
    expect(terms).not.toContain("We deliver only within");
  });

  it("mentions the payment gateway only when online payment is really offered", () => {
    expect(text("privacy", { onlineProvider: "Stripe" })).toContain("Stripe, our payment provider");
    expect(text("terms", { onlineProvider: "Stripe" })).toContain("processed securely by Stripe");
    expect(text("privacy")).not.toContain("payment provider");
  });

  it("drops ordering sections when online ordering is off", () => {
    const off = restaurant({ features: restaurantFeaturesSchema.parse({ onlineOrdering: false }) });
    const doc = buildLegalDocument("terms", facts({ restaurant: off }));
    expect(doc.sections.map((section) => section.id)).not.toContain("orders");
    expect(doc.sections.map((section) => section.id)).not.toContain("cancellations");
  });

  it("states the self-cancellation rule the restaurant configured", () => {
    const settings = restaurantSettingsSchema.parse({
      ordering: { customerCancellation: { enabled: true, allowedPaymentMethods: ["cash_on_delivery"], cutoffStatus: "confirmed" } },
    });
    const terms = text("terms", { restaurant: restaurant({ settings }) });
    expect(terms).toContain("until we start preparing it, if you chose cash on delivery.");

    const disabled = restaurantSettingsSchema.parse({ ordering: { customerCancellation: { enabled: false } } });
    expect(text("terms", { restaurant: restaurant({ settings: disabled }) })).toContain("contact us as soon as possible");
  });

  it("omits reservations, reviews and promotions a restaurant does not offer", () => {
    const features = restaurantFeaturesSchema.parse({ reservations: false, reviews: false, coupons: false, loyalty: false });
    const terms = buildLegalDocument("terms", facts({ restaurant: restaurant({ features }) })).sections.map((s) => s.id);
    expect(terms).not.toContain("reservations");
    expect(terms).not.toContain("reviews");
    expect(terms).not.toContain("promotions");
    expect(text("privacy", { restaurant: restaurant({ features }) })).not.toContain("Reservation details");
  });

  it("lists push, Google sign-in and maps processors only when they are in use", () => {
    const plain = text("privacy");
    expect(plain).not.toContain("Firebase");
    expect(plain).not.toContain("sign in with Google");
    expect(plain).not.toContain("Google Maps");

    const all = text("privacy", { pushNotifications: true, googleSignIn: true, maps: true });
    expect(all).toContain("Firebase Cloud Messaging");
    expect(all).toContain("sign in with Google");
    expect(all).toContain("Google Maps");
    expect(all).toContain("place a pin on the map");
  });

  it("states a minimum order only when one is set", () => {
    const settings = restaurantSettingsSchema.parse({ ordering: { minimumOrderAmount: 1500 } });
    expect(text("terms", { restaurant: restaurant({ settings }) })).toMatch(/minimum order of rs\s?1,500/i);
    expect(text("terms")).not.toContain("minimum order");
  });

  it("gives every section a unique anchor id", () => {
    for (const kind of ["privacy", "terms"] as const) {
      const ids = buildLegalDocument(kind, facts({ onlineProvider: "Stripe", pushNotifications: true })).sections.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

describe("Customize: the template as editable rich-text sections", () => {
  it.each<LegalKind>(["privacy", "terms"])("%s becomes one valid rich_text section per heading, bullets kept", (kind) => {
    const doc = buildLegalDocument(kind, facts({ pushNotifications: true }));
    const sections = legalDocumentSections(doc);
    expect(sections).toHaveLength(doc.sections.length);
    const parsed = parseSections(sections);
    expect(parsed).toHaveLength(sections.length);
    expect(parsed.every((section) => section.type === "rich_text" && section.enabled)).toBe(true);
    expect(sections[0]!.title).toBe(doc.sections[0]!.heading);
    // the privacy policy has bullet lists; the terms are paragraphs only
    const bulleted = doc.sections.find((section) => section.bullets?.length);
    if (bulleted) expect(sections.find((section) => section.title === bulleted.heading)!.body).toContain(`

• ${bulleted.bullets![0]}`);
    else expect(kind).toBe("terms");
  });
});
