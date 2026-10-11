import {
  CANCELLABLE_ORDER_STATUSES,
  ORDER_TYPE_LABELS,
  type OrderType,
  type PaymentMethod,
} from "./contract/enums";
import type { Restaurant, RestaurantLocation } from "./contract/models";
import { formatMoney } from "./money";

/**
 * The default Privacy Policy and Terms of Service every storefront gets at /r/<slug>/privacy and /terms.
 * Pure and isomorphic: the document is built only from the ONE restaurant passed in (its name, legal name,
 * contact details and the features it actually has switched on), so a page can never show another
 * restaurant's text. A restaurant that wants its own wording publishes a `privacy` / `terms` website page
 * instead (components/storefront/configured-page.tsx).
 */

export type LegalKind = "privacy" | "terms";

/** Bump when the template wording changes; shown as "Last updated". */
export const LEGAL_TEMPLATE_UPDATED = "2026-10-12";

export interface LegalFacts {
  restaurantName: string;
  /** the registered business name when set, else the trading name */
  legalName: string;
  country: string;
  email: string | null;
  phone: string | null;
  /** primary branch address on one line */
  address: string | null;
  orderTypes: OrderType[];
  paymentMethods: PaymentMethod[];
  /** the card/wallet gateway's name when online payment is really offered */
  onlineProvider: string | null;
  minimumOrder: string | null;
  reservations: boolean;
  reviews: boolean;
  coupons: boolean;
  loyalty: boolean;
  emailNotifications: boolean;
  pushNotifications: boolean;
  googleSignIn: boolean;
  maps: boolean;
  cancellation: { methods: PaymentMethod[]; cutoff: (typeof CANCELLABLE_ORDER_STATUSES)[number] } | null;
}

export interface LegalFactsInput {
  restaurant: Restaurant;
  primaryLocation: RestaurantLocation | null;
  /** the website's contact email (websites.config.contact.email), which wins over restaurants.email like the footer */
  contactEmail?: string | null | undefined;
  /** from services/checkout#getCheckoutOptions, so the terms list exactly what checkout offers */
  orderTypes: OrderType[];
  paymentMethods: PaymentMethod[];
  onlineProvider: string | null;
  emailNotifications: boolean;
  pushNotifications: boolean;
  googleSignIn: boolean;
  maps: boolean;
}

export function legalFactsFor(input: LegalFactsInput): LegalFacts {
  const { restaurant, primaryLocation } = input;
  const { features, settings } = restaurant;
  const location = primaryLocation;
  const address = location ? addressLine([location.addressLine1, location.addressLine2, location.area, location.city, location.postalCode]) : null;
  const ordering = features.onlineOrdering && settings.ordering.onlineOrderingEnabled;
  const cancellation = settings.ordering.customerCancellation;
  const cancellableMethods = cancellation.allowedPaymentMethods.filter((method) => input.paymentMethods.includes(method));
  const minimum = settings.ordering.minimumOrderAmount;

  return {
    restaurantName: restaurant.name,
    legalName: restaurant.legalName?.trim() || restaurant.name,
    country: countryName(restaurant.country),
    email: input.contactEmail?.trim() || restaurant.email,
    phone: restaurant.phone,
    address,
    orderTypes: ordering ? input.orderTypes : [],
    paymentMethods: ordering ? input.paymentMethods : [],
    onlineProvider: ordering ? input.onlineProvider : null,
    minimumOrder: ordering && minimum > 0 ? formatMoney(minimum, { currency: restaurant.currencySymbol, locale: restaurant.locale }) : null,
    reservations: features.reservations && settings.reservations.enabled,
    reviews: features.reviews,
    coupons: features.coupons,
    loyalty: features.loyalty && settings.loyalty.enabled,
    emailNotifications: input.emailNotifications,
    pushNotifications: input.pushNotifications,
    googleSignIn: input.googleSignIn,
    maps: input.maps,
    cancellation:
      ordering && cancellation.enabled && cancellableMethods.length
        ? { methods: cancellableMethods, cutoff: cancellation.cutoffStatus }
        : null,
  };
}

/**
 * One line, skipping empty and repeated parts: branches often repeat the area inside addressLine1
 * ("71-C, MM Alam Road, Gulberg III") or addressLine2 as well as in `area`.
 */
function addressLine(parts: (string | null)[]): string | null {
  const seen = new Set<string>();
  const kept = parts
    .flatMap((part) => (part ?? "").split(","))
    .map((part) => part.trim())
    .filter((part) => {
      const key = part.toLowerCase();
      if (!part || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return kept.length ? kept.join(", ") : null;
}

/** restaurants.country is an ISO code ("PK"); the documents name the country ("Pakistan"). */
function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export interface LegalSection {
  id: string;
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface LegalDocument {
  kind: LegalKind;
  title: string;
  summary: string;
  /** YYYY-MM-DD */
  updated: string;
  sections: LegalSection[];
}

export function buildLegalDocument(kind: LegalKind, facts: LegalFacts): LegalDocument {
  return kind === "privacy" ? privacyPolicy(facts) : termsOfService(facts);
}

/** "a, b and c" (or "a, b or c") */
function listOf(items: string[], conjunction: "and" | "or" = "and"): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} ${conjunction} ${items.at(-1)}`;
}

/** Payment methods as they read inside a sentence ("We accept cash on delivery and card payment online"). */
const PAYMENT_METHOD_PHRASES: Record<PaymentMethod, string> = {
  cash_on_delivery: "cash on delivery",
  cash: "cash at the restaurant",
  card_online: "card payment online",
  card_terminal: "card at the counter",
  wallet: "mobile wallet",
  bank_transfer: "bank transfer",
};

function paymentMethods(methods: PaymentMethod[], conjunction: "and" | "or" = "and"): string {
  return listOf(methods.map((method) => PAYMENT_METHOD_PHRASES[method]), conjunction);
}

function contactLine(facts: LegalFacts): string {
  const ways = [
    facts.email ? `email ${facts.email}` : null,
    facts.phone ? `call ${facts.phone}` : null,
    facts.address ? `write to us at ${facts.address}` : null,
  ].filter((way): way is string => Boolean(way));
  return ways.length ? `You can ${listOf(ways, "or")}.` :`You can reach us through the contact details on our website.`;
}

function contactSection(facts: LegalFacts, about: string): LegalSection {
  return {
    id: "contact",
    heading: "Contact us",
    paragraphs: [`If you have questions about ${about}, contact ${facts.legalName}. ${contactLine(facts)}`],
  };
}

function privacyPolicy(facts: LegalFacts): LegalDocument {
  const name = facts.restaurantName;
  const ordering = facts.orderTypes.length > 0;
  const delivery = facts.orderTypes.includes("delivery");

  const collected: string[] = [
    "Contact details: your name, phone number and email address.",
    "Account details if you create an account: your password (stored only as a one-way hash, never in readable form), saved addresses, and optional profile details such as gender and date of birth.",
  ];
  if (ordering) {
    collected.push("Order details: what you ordered, special instructions, the branch, the order type, totals, payment method and status history.");
  }
  if (delivery) {
    collected.push(
      facts.maps
        ? "Delivery details: your delivery address and, if you place a pin on the map or share your current location, its coordinates."
        : "Delivery details: your delivery address.",
    );
  }
  if (facts.reservations) collected.push("Reservation details: date, time, party size and any notes you add.");
  if (facts.reviews) collected.push("Reviews: your rating, comments and the name shown with them.");
  if (facts.pushNotifications) collected.push("A notification token for your browser or device, if you turn on order notifications.");
  collected.push("Basic technical data such as your IP address, used to keep the service secure and to limit abuse.");

  const uses: string[] = [];
  if (ordering) uses.push("to take, prepare and deliver or hand over your order, and to contact you about it");
  if (facts.reservations) uses.push("to manage your table reservations");
  uses.push("to create and secure your account, including verifying your email with a one-time code");
  if (facts.emailNotifications || facts.pushNotifications) {
    const channels = [facts.emailNotifications ? "emails" : null, facts.pushNotifications ? "push notifications" : null].filter(Boolean) as string[];
    uses.push(`to send service ${listOf(channels)} about your orders${facts.reservations ? " and reservations" : ""}`);
  }
  if (facts.reviews) uses.push("to publish your review after we have checked it");
  if (facts.coupons) uses.push("to apply promotions and check that a code is used within its limits");
  uses.push("to prevent fraud and abuse and to meet our legal, tax and accounting obligations");

  const processors: string[] = ["Our hosting and database providers, who store the information on our behalf."];
  if (facts.emailNotifications) processors.push("Our email delivery provider, to send verification codes and order emails.");
  if (facts.pushNotifications) processors.push("Google Firebase Cloud Messaging, to deliver push notifications you have turned on.");
  if (facts.onlineProvider) {
    processors.push(
      `${facts.onlineProvider}, our payment provider. Card and wallet details are entered on ${facts.onlineProvider}'s own secure page; we never see or store your full card number.`,
    );
  }
  if (facts.maps) processors.push("Google Maps, when you search for an address or place a pin on the map.");
  if (facts.googleSignIn) processors.push("Google, if you choose to sign in with Google (we receive your name, email address and a Google account identifier).");
  if (delivery) processors.push("The rider or delivery partner who brings your order, who receives only what is needed to deliver it.");

  const cookies = [
    "A sign-in cookie that keeps you signed in.",
    ordering ? "A cart cookie that remembers the items in your cart on this device." : null,
    delivery ? "A cookie that remembers the delivery location you chose." : null,
    ordering ? "A cookie that lets you view orders you placed without an account on this device." : null,
  ].filter((item): item is string => Boolean(item));

  return {
    kind: "privacy",
    title: "Privacy Policy",
    summary: `How ${name} collects, uses and protects your personal information when you use this website.`,
    updated: LEGAL_TEMPLATE_UPDATED,
    sections: [
      {
        id: "who-we-are",
        heading: "Who we are",
        paragraphs: [
          `This website is operated by ${facts.legalName} ("${name}", "we", "us"). This policy applies to the ${name} website and online services only; it does not cover other restaurants or websites, even if they look similar.`,
        ],
      },
      { id: "information-we-collect", heading: "Information we collect", paragraphs: ["We collect only what we need to serve you:"], bullets: collected },
      { id: "how-we-use-it", heading: "How we use your information", paragraphs: ["We use your information:"], bullets: uses.map((use) => `${use.charAt(0).toUpperCase()}${use.slice(1)}.`) },
      {
        id: "sharing",
        heading: "Who we share it with",
        paragraphs: ["We do not sell your personal information. We share it only with service providers that help us run this website, and only for that purpose:"],
        bullets: [...processors, "Authorities, where the law requires us to."],
      },
      {
        id: "cookies",
        heading: "Cookies",
        paragraphs: [
          "We use only cookies that the website needs in order to work. We do not use advertising cookies or third-party tracking.",
        ],
        bullets: cookies,
      },
      {
        id: "retention",
        heading: "How long we keep it",
        paragraphs: [
          "We keep your information for as long as your account is open or as long as we need it to provide our service, and afterwards only as long as the law requires us to keep records such as orders and invoices.",
        ],
      },
      {
        id: "security",
        heading: "How we protect it",
        paragraphs: [
          "Information is sent over encrypted connections, passwords are stored as one-way hashes, and access to customer data is limited to staff who need it to handle your orders.",
        ],
      },
      {
        id: "your-rights",
        heading: "Your choices and rights",
        paragraphs: [
          `You can see and update your profile and saved addresses in your account. You may also ask us for a copy of your information, ask us to correct it, or ask us to delete your account, subject to records we must keep by law. To make a request, contact us using the details below.`,
          ...(facts.pushNotifications ? ["You can turn off push notifications at any time in your browser or device settings."] : []),
        ],
      },
      {
        id: "children",
        heading: "Children",
        paragraphs: ["Our online services are not directed at children, and we do not knowingly collect information from children without a parent's or guardian's consent."],
      },
      {
        id: "changes",
        heading: "Changes to this policy",
        paragraphs: ["We may update this policy from time to time. The date at the top shows when it last changed."],
      },
      contactSection(facts, "this policy or your information"),
    ],
  };
}

const CUTOFF_TEXT: Record<(typeof CANCELLABLE_ORDER_STATUSES)[number], string> = {
  pending: "until we confirm it",
  confirmed: "until we start preparing it",
  preparing: "until it is ready",
  ready: "until it leaves the kitchen or is collected",
  out_for_delivery: "until it is delivered",
};

function termsOfService(facts: LegalFacts): LegalDocument {
  const name = facts.restaurantName;
  const ordering = facts.orderTypes.length > 0;
  const sections: LegalSection[] = [
    {
      id: "about",
      heading: "About these terms",
      paragraphs: [
        `These terms apply when you use the ${name} website, place an order or make a reservation with ${facts.legalName} ("${name}", "we", "us"). By using the website you agree to them. They apply to ${name} only, not to any other restaurant.`,
      ],
    },
    {
      id: "accounts",
      heading: "Your account",
      paragraphs: [
        "You can order and book as a guest or with an account. Please give accurate contact details: we verify your email address with a one-time code and use your phone number to reach you about your order.",
        "Keep your password private. You are responsible for activity on your account, and you should tell us straight away if you think someone else has used it.",
      ],
    },
  ];

  if (ordering) {
    const orderTypes = listOf(facts.orderTypes.map((type) => ORDER_TYPE_LABELS[type].toLowerCase()));
    sections.push({
      id: "orders",
      heading: "Orders",
      paragraphs: [
        `We currently accept online orders for ${orderTypes}. Menu items, prices and availability can change, and an item may be available at one branch but not another.`,
        "Your order is a request until we confirm it. We may decline or cancel an order, for example when an item is unavailable, the kitchen is closed, or the delivery address is outside our area. If that happens after you have paid online, we refund you.",
        ...(facts.minimumOrder ? [`A minimum order of ${facts.minimumOrder} applies.`] : []),
      ],
    });
    sections.push({
      id: "prices",
      heading: "Prices and payment",
      paragraphs: [
        "The total, including any taxes, service fees, delivery fees and discounts, is shown at checkout before you place your order. The prices we charge are the ones calculated when the order is placed.",
        `We accept ${paymentMethods(facts.paymentMethods)}.`,
        ...(facts.onlineProvider
          ? [`Online payments are processed securely by ${facts.onlineProvider}; we do not see or store your full card details.`]
          : []),
      ],
    });
    sections.push({
      id: "cancellations",
      heading: "Cancellations and refunds",
      paragraphs: [
        facts.cancellation
          ? `You can cancel an order yourself from its order page ${CUTOFF_TEXT[facts.cancellation.cutoff]}, if you chose ${paymentMethods(
              facts.cancellation.methods,
              "or",
            )}. After that, or for other payment methods, please contact us and we will help where we can.`
          : "To cancel or change an order, contact us as soon as possible. Once we have started preparing it, we may not be able to cancel it.",
        "If something is wrong with your order, tell us promptly so we can put it right. Refunds for online payments are made to the original payment method and can take a few days to appear.",
      ],
    });
    if (facts.orderTypes.includes("delivery") || facts.orderTypes.includes("pickup")) {
      sections.push({
        id: "delivery",
        heading: facts.orderTypes.includes("delivery") ? "Delivery and collection" : "Collection",
        paragraphs: [
          "Preparation and delivery times are estimates. Please make sure someone is available at the address or at the counter to receive the order; food left uncollected cannot be stored indefinitely.",
          ...(facts.orderTypes.includes("delivery")
            ? ["We deliver only within the areas served by our branches; checkout tells you whether your address is covered."]
            : []),
        ],
      });
    }
  }

  if (facts.reservations) {
    sections.push({
      id: "reservations",
      heading: "Reservations",
      paragraphs: [
        "A reservation request is confirmed once you receive our confirmation. Please arrive on time and let us know as early as possible if your plans change; we may release a table if you are late.",
      ],
    });
  }

  if (facts.coupons || facts.loyalty) {
    sections.push({
      id: "promotions",
      heading: "Promotions",
      paragraphs: [
        "Promotion codes and offers are subject to their own conditions (such as dates, minimum spend, order type and usage limits), have no cash value and cannot be combined unless we say so. We may withdraw a promotion that is being misused.",
      ],
    });
  }

  sections.push({
    id: "allergens",
    heading: "Allergies and dietary needs",
    paragraphs: [
      "Dishes are prepared in a kitchen that handles common allergens. If you have an allergy or dietary requirement, tell us in your order notes or contact us before ordering. Menu descriptions and dietary labels are given in good faith, but we cannot guarantee that any dish is free of a particular ingredient.",
    ],
  });

  if (facts.reviews) {
    sections.push({
      id: "reviews",
      heading: "Reviews",
      paragraphs: [
        "Reviews must be honest, about your own experience and free of offensive, unlawful or personal content. We check reviews before publishing them and may decline or remove one that breaks these rules. By submitting a review you allow us to display it on our website.",
      ],
    });
  }

  sections.push(
    {
      id: "acceptable-use",
      heading: "Using the website",
      paragraphs: [
        "Do not misuse the website: no false orders or bookings, no attempts to access other people's accounts or data, and no interference with how the website works. We may suspend accounts or refuse orders that break these terms.",
      ],
    },
    {
      id: "liability",
      heading: "Our responsibility to you",
      paragraphs: [
        "We take care to provide an accurate website and a good service, but the website is provided as it is and may occasionally be unavailable. To the extent the law allows, our responsibility for any order is limited to the amount you paid for it. Nothing in these terms limits rights you have under consumer law.",
      ],
    },
    {
      id: "privacy",
      heading: "Your privacy",
      paragraphs: ["How we handle your personal information is explained in our Privacy Policy."],
    },
    {
      id: "law",
      heading: "Governing law",
      paragraphs: [`These terms are governed by the laws of ${facts.country}, and disputes are handled by its courts.`],
    },
    {
      id: "changes",
      heading: "Changes to these terms",
      paragraphs: ["We may update these terms from time to time. The version shown here applies to orders and bookings made while it is published."],
    },
    contactSection(facts, "these terms or an order"),
  );

  return {
    kind: "terms",
    title: "Terms of Service",
    summary: `The terms for ordering from, booking with and using the ${name} website.`,
    updated: LEGAL_TEMPLATE_UPDATED,
    sections,
  };
}

/** Rich-text body limit (shared/contract/sections.ts richTextSectionSchema.body). */
const RICH_TEXT_MAX = 8000;

/**
 * The document as editable `rich_text` sections, one per heading (paragraphs and "• " bullets separated by
 * blank lines, which is how the rich-text section splits paragraphs). The super admin's "Customize" starts a
 * restaurant's own privacy / terms page from this, so the owner edits the text instead of writing it from scratch.
 */
export function legalDocumentSections(document: LegalDocument): { type: "rich_text"; enabled: true; title: string; body: string; width: "wide" }[] {
  return document.sections.map((section) => ({
    type: "rich_text",
    enabled: true,
    title: section.heading,
    body: [...section.paragraphs, ...(section.bullets ?? []).map((bullet) => `• ${bullet}`)].join("\n\n").slice(0, RICH_TEXT_MAX),
    width: "wide",
  }));
}
