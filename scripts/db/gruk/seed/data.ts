/**
 * GRUK — burgers, tenders and fries, Bagh Ali Road, Cantt, Lahore. A DEMO tenant built to pitch the platform to the
 * restaurant itself, inserted through the real schema by ./seed.ts.
 *
 * What is REAL (public sources, 2026-10-20):
 *   - Instagram @grukitup: name GRUK, "Highkey Worth it", "Burgers. Tenders. Fries.", "Falcon Complex, Bagh Ali Road,
 *     Cantt", phone 0323 2133339, "Get Gruk'd" on the logo, "We don't do medium." on a post, a maroon / cream look.
 *   - foodpanda (GRUK, Lahore): every category, dish name, description and list price below (the undiscounted price;
 *     foodpanda's own 10% app deal is not GRUK's menu price).
 * What is NOT real (stand-ins for the demo, replace before going live):
 *   - Photos: food stock photos already in this repo (scripts/db/bun-intended/images), not GRUK's own pictures.
 *   - Logo: an original SVG roundel in GRUK's colours, not the official file.
 *   - Opening hours, map pin (approximate), delivery areas and fees, coupons, email domain, staff, customers, orders.
 * No reviews are seeded: a real restaurant's demo must not show invented customer reviews.
 */

/** Deterministic, valid v4-shaped uuids: group = kind of row, n = ordinal. Prefix 6a0c is this tenant's own. */
const uid = (group: number, n: number): string =>
  `6a0c${group.toString(16).padStart(4, "0")}-eeee-4eee-8eee-${n.toString().padStart(12, "0")}`;

export const IDS = {
  restaurant: uid(1, 1),
  locationCantt: uid(2, 1),
  website: uid(3, 1),
  pageHome: uid(4, 1),
  pageAbout: uid(4, 2),
  pageContact: uid(4, 3),
  pageMenu: uid(4, 4),
  pageLocations: uid(4, 7),
  zoneCantt: uid(5, 1),
  zoneGulberg: uid(5, 2),
  couponWelcome: uid(6, 1),
  couponFreeDelivery: uid(6, 2),
  memberOwner: uid(7, 1),
  memberManager: uid(7, 2),
  memberStaff: uid(7, 3),
  userOwner: uid(8, 1),
  userManager: uid(8, 2),
  userStaff: uid(8, 3),
} as const;

export const SLUG = "gruk";
const IMG = `/images/${SLUG}`;
/** the restaurant's own number from Instagram */
const PHONE = "+92 323 2133339";
/** no public email or website: a reserved demo domain, replaced when the restaurant gives its own */
const DOMAIN = "gruk.example";

export const RESTAURANT = {
  name: "GRUK",
  slug: SLUG,
  legalName: "GRUK",
  tagline: "Highkey worth it",
  city: "Lahore",
  shortDescription: "Burgers. Tenders. Fries. Double-smashed beef, crunchy chicken and saucy tenders on Bagh Ali Road, Cantt.",
  description:
    "GRUK keeps it to three things and takes all three seriously: burgers, tenders and fries. Double-smashed beef with sauces that have names, fried chicken that bites back, tenders three ways and fries to dunk in Garlic Ghost or the Gruk'd Secret. Find us at Falcon Complex, Bagh Ali Road, Cantt, or get it delivered.",
  cuisines: ["Burgers", "Fast Food", "Western"],
  phone: PHONE,
  whatsapp: PHONE,
  email: `hello@${DOMAIN}`,
  websiteUrl: null as string | null,
  currency: "PKR",
  currencySymbol: "Rs",
  timezone: "Asia/Karachi",
  social: { instagram: "https://www.instagram.com/grukitup/" },
  logo: `${IMG}/logo.png`,
  cover: `${IMG}/cover.jpg`,
};

export const SETTINGS = {
  // the menu prices are the prices customers pay: tax shown as included, never added on top
  tax: { enabled: true, rate: 16, included: true, applyOnDeliveryFee: false, label: "Sales tax (included)" },
  serviceFee: { enabled: false, rate: 0, orderTypes: ["dine_in"] },
  ordering: {
    onlineOrderingEnabled: true,
    minimumOrderAmount: 800,
    maxAdvanceDays: 1,
    allowScheduledOrders: true,
    preparationTimeMinutes: 15,
    packagingCharge: 0,
    requirePhoneVerification: false,
  },
  payments: { enabledMethods: ["cash_on_delivery", "cash"], onlineProvider: "none", payAtStoreEnabled: true },
  // a takeaway spot: no table bookings
  reservations: {
    enabled: false, slotMinutes: 30, minGuests: 1, maxGuests: 6, autoConfirm: false, maxAdvanceDays: 7, defaultDurationMinutes: 60, tables: [],
  },
  delivery: { enabled: true, defaultEtaMinutes: 35, freeDeliveryOver: null, trackingEnabled: true },
  loyalty: { enabled: false, pointsPerCurrencyUnit: 1, redeemRate: 0.01 },
  receipt: { footerNote: "Thanks for getting Gruk'd. Tag us @grukitup", showTaxNumber: false },
};

export const FEATURES = {
  onlineOrdering: true,
  delivery: true,
  pickup: true,
  dineIn: false,
  reservations: false,
  reviews: false,
  coupons: true,
  loyalty: false,
  gallery: true,
  customDomain: false,
  analytics: true,
  onlinePayments: false,
  notifications: true,
  notificationChannels: { emailNotify: true, pushNotify: true },
};

/** NOT public: placeholder evening hours until the restaurant confirms its own */
const OPEN = [{ open: "13:00", close: "01:00" }];
const LATE = [{ open: "13:00", close: "02:00" }];
const HOURS = { mon: OPEN, tue: OPEN, wed: OPEN, thu: OPEN, fri: LATE, sat: LATE, sun: OPEN };

export const LOCATIONS = [
  {
    id: IDS.locationCantt, name: "GRUK Cantt", slug: "cantt", primary: true,
    line1: "Falcon Complex, Bagh Ali Road", area: "Cantt", city: "Lahore", state: "Punjab",
    // approximate pin (Lahore Cantt); set the exact one in admin → Locations
    postalCode: "54810", phone: PHONE, latitude: 31.5206, longitude: 74.3793, hours: HOURS,
    settings: { dineIn: false, parking: true },
  },
];

/**
 * Light and airy like Blue Hour (white-dominant, serif headings, big photos), wearing GRUK's Instagram colours:
 * warm paper ground, near-black type (16:1), maroon buttons (cream text 9:1), mustard accents, and the night bands
 * (hero, closing CTA, footer) in the black of their posts. Anton = the condensed poster face of their posts (headlines written in caps).
 */
export const THEME = {
  name: "Get Gruk'd — paper & maroon",
  primary: "#7B1E26",
  primaryForeground: "#FFF6E8",
  secondary: "#150C0D",
  accent: "#E8B04B",
  background: "#FFFBF5",
  surface: "#FFFFFF",
  foreground: "#1A1112",
  muted: "#6E5E5B",
  border: "#EADFD3",
  font: "Anton",
  bodyFont: "DM Sans",
  radius: "lg",
  dark: false,
  surfaceMuted: "#F7EFE4",
  surfaceDark: "#150C0D",
  foregroundOnDark: "#FBF3E6",
  accentForeground: "#150C0D",
};


export const NAV = [
  { label: "Home", href: "/", enabled: true },
  { label: "Menu", href: "/menu", enabled: true },
  { label: "About", href: "/about", enabled: true },
  { label: "Find us", href: "/locations", enabled: true },
  { label: "Contact", href: "/contact", enabled: true },
];

export const TEAM = [
  { id: IDS.userOwner, member: IDS.memberOwner, email: `owner@${DOMAIN}`, name: "GRUK Owner", role: "owner", password: "GrukDemo#1", phone: PHONE },
  { id: IDS.userManager, member: IDS.memberManager, email: `manager@${DOMAIN}`, name: "Shift Manager", role: "manager", password: "GrukDemo#2", phone: "+92 300 0000002" },
  { id: IDS.userStaff, member: IDS.memberStaff, email: `kitchen@${DOMAIN}`, name: "Kitchen", role: "staff", password: "GrukDemo#3", phone: "+92 300 0000003" },
];
/** Staff name written on seeded order status changes. */
export const SHIFT_LEAD = "Shift Manager";

// ---------------------------------------------------------------------------
// Menu — every name, description and price as on GRUK's foodpanda menu
// ---------------------------------------------------------------------------
export interface SeedCategory { slug: string; name: string; description: string; image: string; icon: string; featured?: boolean }

const m = (file: string) => `${IMG}/menu/${file}.jpg`;

export const CATEGORIES: SeedCategory[] = [
  { slug: "beef-burgers", name: "Beef Burgers", description: "Double-smashed beef. We don't do medium.", image: m("smash-attack"), icon: "beef", featured: true },
  { slug: "chicken-burgers", name: "Chicken Burgers", description: "Crunchy, saucy, with a kick.", image: m("crunch-mode"), icon: "drumstick", featured: true },
  { slug: "tenders", name: "Tenders", description: "Three ways: fiery, spicy or glazed.", image: m("tenders"), icon: "flame", featured: true },
  { slug: "fries", name: "Fries", description: "Plain, or bravas-style with a kick.", image: m("classic-fries"), icon: "utensils" },
  { slug: "dips", name: "Dips", description: "Pick your dunk.", image: m("dip-trio"), icon: "sparkles" },
  { slug: "add-ons", name: "Add Ons", description: "Stack it your way.", image: m("extra-cheese-slice"), icon: "star" },
  { slug: "beverages", name: "Beverages", description: "Something cold.", image: m("pepsi"), icon: "cup-soda" },
];

export interface SeedVariant { name: string; price: string; isDefault?: boolean }
export interface SeedAddonGroup {
  name: string; isRequired?: boolean; minSelect?: number; maxSelect?: number;
  addons: { name: string; price: string; isDefault?: boolean; maxQuantity?: number }[];
}
export interface SeedItem {
  name: string; slug: string; category: string; image: string | null; price: string; compareAtPrice?: string;
  description: string; shortDescription?: string; prepTime: number; spiceLevel?: number;
  dietaryTags?: string[]; allergens?: string[]; featured?: boolean; calories?: number;
  variants?: SeedVariant[]; addonGroups?: SeedAddonGroup[];
}

/** GRUK's own Add Ons, offered on every burger (optional, so "Add to Cart" still adds in one tap) */
const BURGER_ADD_ONS: SeedAddonGroup = {
  name: "Add ons", maxSelect: 3,
  addons: [
    { name: "Extra Cheese Slice", price: "150.00", maxQuantity: 2 },
    { name: "Single Patty", price: "250.00", maxQuantity: 2 },
    { name: "Gherkin's Add On", price: "100.00" },
  ],
};
/** GRUK's own Dips, offered with tenders and fries */
const DIPS: SeedAddonGroup = {
  name: "Dips", maxSelect: 3,
  addons: [
    { name: "Garlic Ghost", price: "150.00", maxQuantity: 2 },
    { name: "Gruk'd Secret", price: "150.00", maxQuantity: 2 },
    { name: "Chaos", price: "150.00", maxQuantity: 2 },
  ],
};

export const ITEMS: SeedItem[] = [
  // ── Beef Burgers ─────────────────────────────────────────────────────────
  {
    name: "Solid Smash", slug: "solid-smash", category: "beef-burgers", image: m("smash-attack"),
    price: "1040.00", featured: true, prepTime: 12,
    shortDescription: "Double smash, caramelized onions, signature base sauce",
    description: "A classic smashed beef burger done right: double beef patties, melted cheese, sweet caramelized onions, crisp iceberg and finished with our signature base sauce.",
    addonGroups: [BURGER_ADD_ONS],
  },
  {
    name: "Shroom-e-alaa", slug: "shroom-e-alaa", category: "beef-burgers", image: m("rich-kid"),
    price: "1090.00", featured: true, prepTime: 13,
    shortDescription: "Double smash, mushroom mixture, creamy mushroom sauce",
    description: "Two smashed beef patties loaded with our mushroom mixture, creamy mushroom sauce, topped with melted cheese and crisp iceberg for a rich and earthy bite.",
    addonGroups: [BURGER_ADD_ONS],
  },
  {
    name: "The Pepper Melt", slug: "the-pepper-melt", category: "beef-burgers", image: m("double-trouble"),
    price: "1190.00", featured: true, prepTime: 13, spiceLevel: 1,
    shortDescription: "Double smash, American cheese, pepper melt sauce",
    description: "Double smashed beef patties layered with melted American cheese, crisp iceberg, pickles and our bold pepper melt sauce for a rich and peppery finish.",
    addonGroups: [BURGER_ADD_ONS],
  },

  // ── Chicken Burgers ──────────────────────────────────────────────────────
  {
    name: "Pookie Bird", slug: "pookie-bird", category: "chicken-burgers", image: m("crunch-mode"),
    price: "890.00", featured: true, prepTime: 12, spiceLevel: 1,
    shortDescription: "Crispy chicken, jalapeño, sweet-spicy chilli glaze",
    description: "Crispy fried chicken stacked with melted cheese, fresh iceberg and jalapeño, finished with a sweet, spicy chilli glaze and our signature base sauce.",
    addonGroups: [BURGER_ADD_ONS],
  },
  {
    name: "Jawbreaker", slug: "jawbreaker", category: "chicken-burgers", image: m("nashville-unhinged"),
    price: "940.00", featured: true, prepTime: 12, spiceLevel: 3,
    shortDescription: "Fried chicken, chilli oil, jalapeños, Frenzy sauce",
    description: "Crunchy fried chicken with a serious kick, layered with chilli oil, jalapeños and fresh iceberg, then finished with our bold and flavour-packed Frenzy sauce.",
    addonGroups: [BURGER_ADD_ONS],
  },
  {
    name: "Doomsday", slug: "doomsday", category: "chicken-burgers", image: m("crispy-era"),
    price: "940.00", prepTime: 13,
    shortDescription: "Grilled chicken, crispy fried potato, creamy sauce",
    description: "Grilled chicken meets crispy fried potato, a smooth creamy sauce, fresh iceberg and pickles, all brought together for a loaded burger with a satisfying crunch.",
    addonGroups: [BURGER_ADD_ONS],
  },

  // ── Tenders ──────────────────────────────────────────────────────────────
  {
    name: "Fire and Velvet", slug: "fire-and-velvet", category: "tenders", image: m("tenders"),
    price: "850.00", featured: true, prepTime: 10, spiceLevel: 2,
    description: "Chicken tenders with a fiery and smooth sauce.",
    addonGroups: [DIPS],
  },
  {
    name: "Spice Boom", slug: "spice-boom", category: "tenders", image: m("nuggets"),
    price: "850.00", prepTime: 10, spiceLevel: 3,
    description: "Spicy chicken tenders.",
    addonGroups: [DIPS],
  },
  {
    name: "Glaze and Daze", slug: "glaze-and-daze", category: "tenders", image: m("sticky-wings"),
    price: "850.00", prepTime: 10,
    description: "Sweetly glazed chicken tenders.",
    addonGroups: [DIPS],
  },

  // ── Fries ────────────────────────────────────────────────────────────────
  {
    name: "Plain Fries", slug: "plain-fries", category: "fries", image: m("classic-fries"),
    price: "400.00", prepTime: 6,
    description: "Classic, crispy fried potatoes, lightly salted.",
    dietaryTags: ["vegetarian"],
    addonGroups: [DIPS],
  },
  {
    name: "Bravas Potatoes", slug: "bravas-potatoes", category: "fries", image: m("peri-fries"),
    price: "850.00", featured: true, prepTime: 8, spiceLevel: 1,
    description: "Crispy potatoes served with a spicy bravas sauce.",
    dietaryTags: ["vegetarian"],
    addonGroups: [DIPS],
  },

  // ── Dips ─────────────────────────────────────────────────────────────────
  { name: "Garlic Ghost", slug: "garlic-ghost", category: "dips", image: m("sauce-pot"), price: "150.00", prepTime: 1, description: "A rich and savory garlic dip with a hint of spice.", dietaryTags: ["vegetarian"] },
  { name: "Gruk'd Secret", slug: "grukd-secret", category: "dips", image: m("dip-trio"), price: "150.00", prepTime: 1, description: "A mysterious and flavorful dip with a unique blend of spices.", dietaryTags: ["vegetarian"] },
  { name: "Chaos", slug: "chaos", category: "dips", image: m("sauce-pot"), price: "150.00", prepTime: 1, description: "A complex dip with a blend of savory and tangy flavors.", dietaryTags: ["vegetarian"] },

  // ── Add Ons ──────────────────────────────────────────────────────────────
  { name: "Extra Cheese Slice", slug: "extra-cheese-slice", category: "add-ons", image: m("extra-cheese-slice"), price: "150.00", prepTime: 1, description: "An additional slice of melted cheese." },
  { name: "Single Patty", slug: "single-patty", category: "add-ons", image: m("single-patty"), price: "250.00", prepTime: 5, description: "An additional single patty for your meal." },
  { name: "Gherkin's Add On", slug: "gherkins-add-on", category: "add-ons", image: m("gherkins-add-on"), price: "100.00", prepTime: 1, description: "Tangy gherkin pickles to complement your dish." },

  // ── Beverages ────────────────────────────────────────────────────────────
  { name: "Aquafina Water", slug: "aquafina-water", category: "beverages", image: m("aquafina-water"), price: "90.00", prepTime: 1, description: "500 ml bottle." },
  { name: "Pepsi", slug: "pepsi", category: "beverages", image: m("pepsi"), price: "150.00", prepTime: 1, description: "345 ml can." },
];

/** NOT public: demo delivery areas and fees around Cantt, to be set by the restaurant */
export const ZONES = [
  {
    id: IDS.zoneCantt, locationId: IDS.locationCantt, name: "Cantt & nearby", description: "Closest to the Bagh Ali Road kitchen.",
    areas: ["Cantt", "Bagh Ali Road", "Sarwar Road", "Askari", "Saddar", "Walton"], postalCodes: ["54810"], fee: "150.00", minOrder: "800.00", freeOver: "3000.00", etaMin: 25, etaMax: 40,
  },
  {
    id: IDS.zoneGulberg, locationId: IDS.locationCantt, name: "Gulberg & DHA",
    areas: ["Gulberg", "DHA Phase 1", "DHA Phase 2", "DHA Phase 3", "DHA Phase 4", "DHA Phase 5", "Cavalry Ground"], postalCodes: ["54660", "54792"], fee: "250.00", minOrder: "1200.00", freeOver: null, etaMin: 35, etaMax: 55,
  },
];

/** NOT public: two demo offers that show how coupons work, inactive until the restaurant switches them on */
export const COUPONS = [
  { id: IDS.couponWelcome, code: "GETGRUKD", description: "10% off your first order", type: "percentage", value: "10.00", minOrder: "1000.00", maxDiscount: "300.00", appliesTo: "order", usageLimit: 500, perCustomer: 1, startsAt: -1, endsAt: 60, active: true },
  { id: IDS.couponFreeDelivery, code: "HIGHKEY", description: "Free delivery on orders above Rs 2,500", type: "fixed", value: "250.00", minOrder: "2500.00", maxDiscount: null, appliesTo: "delivery_fee", usageLimit: 300, perCustomer: null, startsAt: -1, endsAt: 30, active: true },
];

// ---------------------------------------------------------------------------
// Demo people and orders (fictional; example.com) — so the admin dashboard, kitchen board and reports show
// something during the demo. Delete before going live. No reviews, no reservations.
// ---------------------------------------------------------------------------
const c = (n: number) => uid(9, n);
export const CUSTOMERS = [
  { id: c(1), name: "Ali Raza", phone: "+92 300 4441101", email: "ali.raza@example.com", account: true, address: { label: "Home", line1: "House 12, Street 4, Askari 10", area: "Askari", city: "Lahore", postalCode: "54810" } },
  { id: c(2), name: "Hira Saleem", phone: "+92 321 4441102", email: "hira.saleem@example.com", account: false, address: { label: "Home", line1: "House 33, Block E", area: "Gulberg", city: "Lahore", postalCode: "54660" } },
  { id: c(3), name: "Usman Tariq", phone: "+92 333 4441103", email: "usman.tariq@example.com", account: false, address: { label: "Office", line1: "Office 7, Sarwar Road", area: "Cantt", city: "Lahore", postalCode: "54810" } },
  { id: c(4), name: "Sara Malik", phone: "+92 345 4441104", email: "sara.malik@example.com", account: true, address: { label: "Home", line1: "House 140, Phase 3", area: "DHA Phase 3", city: "Lahore", postalCode: "54792" } },
  { id: c(5), name: "Hamza Iqbal", phone: "+92 301 4441105", email: "hamza.iqbal@example.com", account: false, address: { label: "Hostel", line1: "Room 21, Boys Hostel", area: "Walton", city: "Lahore", postalCode: "54810" } },
];
const cust = (n: number) => CUSTOMERS[n - 1]!;

export const REVIEWS: { customer: number | null; itemSlug: string; author: string; rating: number; title: string; comment: string; status: string; featured: boolean; daysAgo: number }[] = [];
export const RESERVATIONS: { customer: number; daysAhead: number; time: string; guests: number; table: string | null; status: string; occasion: string | null; requests: string | null }[] = [];

export interface SeedOrder {
  customer: number;
  location: "cantt";
  orderType: "delivery" | "pickup" | "dine_in";
  status: "pending" | "confirmed" | "preparing" | "ready" | "out_for_delivery" | "completed" | "cancelled";
  hoursAgo: number;
  zoneId?: string;
  paymentMethod: "cash_on_delivery" | "cash" | "card_terminal";
  paymentStatus: "pending" | "paid" | "failed" | "cancelled";
  couponCode?: string;
  tableNumber?: string;
  guests?: number;
  notes?: string;
  items: { slug: string; quantity: number; variant?: string; addons?: string[] }[];
}

export const ORDERS: SeedOrder[] = [
  { customer: 1, location: "cantt", orderType: "delivery", status: "pending", hoursAgo: 0.2, zoneId: IDS.zoneCantt, paymentMethod: "cash_on_delivery", paymentStatus: "pending", couponCode: "GETGRUKD", notes: "Extra Garlic Ghost please.",
    items: [{ slug: "solid-smash", quantity: 2, addons: ["Extra Cheese Slice"] }, { slug: "plain-fries", quantity: 1, addons: ["Garlic Ghost"] }] },
  { customer: 2, location: "cantt", orderType: "delivery", status: "preparing", hoursAgo: 0.6, zoneId: IDS.zoneGulberg, paymentMethod: "cash_on_delivery", paymentStatus: "pending",
    items: [{ slug: "the-pepper-melt", quantity: 1 }, { slug: "jawbreaker", quantity: 1 }, { slug: "bravas-potatoes", quantity: 1 }, { slug: "pepsi", quantity: 2 }] },
  { customer: 3, location: "cantt", orderType: "pickup", status: "ready", hoursAgo: 0.4, paymentMethod: "cash", paymentStatus: "pending",
    items: [{ slug: "fire-and-velvet", quantity: 1, addons: ["Gruk'd Secret"] }, { slug: "pookie-bird", quantity: 1 }] },
  { customer: 4, location: "cantt", orderType: "delivery", status: "out_for_delivery", hoursAgo: 0.9, zoneId: IDS.zoneGulberg, paymentMethod: "cash_on_delivery", paymentStatus: "pending", couponCode: "HIGHKEY",
    items: [{ slug: "shroom-e-alaa", quantity: 2 }, { slug: "glaze-and-daze", quantity: 1, addons: ["Chaos"] }, { slug: "plain-fries", quantity: 1 }] },
  { customer: 5, location: "cantt", orderType: "delivery", status: "completed", hoursAgo: 23, zoneId: IDS.zoneCantt, paymentMethod: "cash_on_delivery", paymentStatus: "paid",
    items: [{ slug: "doomsday", quantity: 1 }, { slug: "spice-boom", quantity: 1 }, { slug: "aquafina-water", quantity: 2 }] },
  { customer: 1, location: "cantt", orderType: "pickup", status: "completed", hoursAgo: 49, paymentMethod: "cash", paymentStatus: "paid",
    items: [{ slug: "solid-smash", quantity: 1, addons: ["Single Patty"] }, { slug: "bravas-potatoes", quantity: 1 }] },
  { customer: 4, location: "cantt", orderType: "delivery", status: "completed", hoursAgo: 72, zoneId: IDS.zoneGulberg, paymentMethod: "cash_on_delivery", paymentStatus: "paid",
    items: [{ slug: "pookie-bird", quantity: 2 }, { slug: "fire-and-velvet", quantity: 1 }, { slug: "pepsi", quantity: 2 }] },
  { customer: 2, location: "cantt", orderType: "delivery", status: "cancelled", hoursAgo: 96, zoneId: IDS.zoneGulberg, paymentMethod: "cash_on_delivery", paymentStatus: "cancelled", notes: "Customer cancelled — wrong address.",
    items: [{ slug: "the-pepper-melt", quantity: 2 }] },
];

export { cust };

// ---------------------------------------------------------------------------
// Website content
// ---------------------------------------------------------------------------
const gal = (file: string) => `${IMG}/gallery/${file}.jpg`;

export const WEBSITE_CONFIG = {
  announcement: { enabled: true, text: "New here? Use GETGRUKD for 10% off your first order", linkLabel: "Order now", linkHref: "/menu" },
  navigation: { items: NAV, showCart: true, sticky: true, tone: "light", style: "centered", dock: { enabled: true, tabs: ["home", "menu", "locations", "account"] } },
  footer: {
    tagline: "Burgers. Tenders. Fries. Highkey worth it. Falcon Complex, Bagh Ali Road, Cantt, Lahore.",
    columns: [
      { title: "Eat", links: [
        { label: "Full menu", href: "/menu", enabled: true },
        { label: "Beef burgers", href: "/menu#beef-burgers", enabled: true },
        { label: "Tenders", href: "/menu#tenders", enabled: true },
      ] },
      { title: "GRUK", links: [
        { label: "About", href: "/about", enabled: true },
        { label: "Find us", href: "/locations", enabled: true },
        { label: "Contact", href: "/contact", enabled: true },
      ] },
    ],
    legalNote: "Prices include sales tax.",
  },
  ordering: { defaultOrderType: "delivery", allowGuestCheckout: true, showPrepTime: false, ctaLabel: "Order now" },
  contact: { email: RESTAURANT.email, showWhatsapp: true },
  social: { instagram: RESTAURANT.social.instagram },
};

export const HOME_SECTIONS = [
  {
    type: "hero", enabled: true, eyebrow: "Bagh Ali Road · Cantt, Lahore",
    title: "WE DON'T DO MEDIUM.",
    subtitle: "Double-smashed beef, chicken that bites back, tenders three ways and fries. Highkey worth it.",
    image: { url: `${IMG}/cover.jpg`, alt: "A smashed beef burger and fries on a dark board" },
    alignment: "left", overlay: 0.5, height: "lg",
    primaryCta: { label: "Order now", href: "/menu", style: "primary" },
    secondaryCta: { label: "See the menu", href: "/menu", style: "outline" },
    highlights: ["Double-smashed beef", "Sauces with names", "Delivery or pickup"],
  },
  {
    type: "order_type_switch", enabled: true, title: "HOW DO YOU WANT IT?",
    orderTypes: ["delivery", "pickup"], showEta: true,
    deliveryText: "Hot to your door across Cantt, Gulberg and DHA.",
    pickupText: "Order ahead, grab it at Falcon Complex.",
  },
  {
    type: "featured_items", enabled: true, eyebrow: "Beef, double-smashed", title: "THE SMASH LINEUP", subtitle: "Double patties, smashed to order. Sauces with names.",
    itemSlugs: ["solid-smash", "shroom-e-alaa", "the-pepper-melt"], limit: 3, layout: "grid",
    cta: { label: "Full menu", href: "/menu", style: "outline" },
  },
  {
    type: "featured_items", enabled: true, eyebrow: "The chicken side", title: "CHICKEN THAT BITES BACK", subtitle: "Crispy, grilled or straight-up chaos.",
    itemSlugs: ["pookie-bird", "jawbreaker", "doomsday"], limit: 3, layout: "grid",
  },
  {
    type: "menu_categories", enabled: true, title: "PICK YOUR SIDE OF THE MENU", subtitle: "Beef, chicken, tenders, fries, dips and the extras.", limit: 7, showImages: true,
  },
  {
    type: "menu_preview", enabled: true, title: "TENDERS THREE WAYS", subtitle: "Fiery, spicy or glazed. Pick a dip, or three.",
    itemSlugs: ["fire-and-velvet", "spice-boom", "glaze-and-daze", "bravas-potatoes"], limit: 4,
  },
  {
    type: "why_choose_us", enabled: true, title: "THREE THINGS. DONE RIGHT.",
    items: [
      { icon: "beef", title: "Smashed, never medium", description: "Every beef burger is two patties, smashed thin on the griddle for crispy edges." },
      { icon: "flame", title: "Sauces with names", description: "Signature base sauce, Pepper Melt, Frenzy, and dips like Garlic Ghost and the Gruk'd Secret." },
      { icon: "drumstick", title: "TENDERS THREE WAYS", description: "Fire and Velvet, Spice Boom or Glaze and Daze. Choose your mood." },
      { icon: "truck", title: "Delivery or pickup", description: "Order online for delivery, or pick it up from Bagh Ali Road, Cantt." },
    ],
  },
  {
    type: "gallery", enabled: true, title: "@grukitup", subtitle: "Tag us when you get Gruk'd.",
    images: [
      { url: gal("hands-on"), alt: "Hands-on" },
      { url: gal("the-og"), alt: "The OG" },
      { url: gal("slider-squad"), alt: "Squad goals" },
      { url: gal("wing-night"), alt: "Dip it" },
    ],
    columns: 2,
  },
  {
    type: "cta", enabled: true, title: "HUNGRY?", subtitle: "Burgers, tenders and fries, delivered or ready at Falcon Complex.",
    tone: "image", image: { url: `${IMG}/hero.jpg`, alt: "A double smash burger" },
    cta: { label: "Order now", href: "/menu", style: "primary" },
  },
];

export const ABOUT_SECTIONS = [
  {
    type: "hero", enabled: true, eyebrow: "About GRUK", title: "HIGHKEY WORTH IT.",
    subtitle: "Burgers. Tenders. Fries. That's the menu, and that's the point.",
    image: { url: gal("slider-squad"), alt: "Burgers lined up to share" }, height: "sm", alignment: "center",
  },
  {
    type: "rich_text", enabled: true, title: "THREE THINGS, TAKEN SERIOUSLY",
    body: "A short menu, on purpose. Every item earns its spot.\n\nBeef burgers are double-smashed and finished with sauces we named ourselves. Chicken comes crispy with a kick, or grilled with crispy potato. Tenders come three ways, and the fries come with dips worth the extra.\n\nYou'll find us at Falcon Complex, Bagh Ali Road, Cantt. Order online for delivery or pickup, or follow @grukitup to see what's coming off the griddle.",
    width: "narrow",
  },
  { type: "cta", enabled: true, title: "ENOUGH READING. GET GRUK'D.", tone: "primary", cta: { label: "Order now", href: "/menu", style: "primary" } },
];

export const CONTACT_SECTIONS = [
  { type: "hero", enabled: true, eyebrow: "Contact", title: "TALK TO GRUK", subtitle: `Call or WhatsApp ${PHONE}, or find us at Falcon Complex, Bagh Ali Road, Cantt.`, height: "sm", alignment: "center" },
  { type: "contact", enabled: true, title: "Get in touch", showForm: true },
  { type: "locations", enabled: true, title: "FIND US", showMap: true },
];

/** Functional pages: `page_content` marks where the built-in body sits. The menu uses the phone-first product cards. */
export const MENU_SECTIONS = [
  {
    type: "page_content", enabled: true, menuLayout: "cards",
    title: "GET GRUK'D", subtitle: "Burgers. Tenders. Fries.",
    searchPlaceholder: "Search burgers, tenders, fries…",
    image: { url: `${IMG}/menu-banner.jpg`, alt: "Burger and fries" },
    photoDarkening: 0.5, mobileBannerHeight: "medium",
  },
];

export const LOCATIONS_SECTIONS = [
  { type: "page_content", enabled: true, title: "FIND US", subtitle: "Falcon Complex, Bagh Ali Road, Cantt, Lahore." },
  { type: "cta", enabled: true, title: "TOO FAR TO COME BY?", subtitle: "We deliver across Cantt, Gulberg and DHA.", tone: "neutral", cta: { label: "Order delivery", href: "/menu", style: "primary" } },
];

/** [public url, file name, purpose, width, height] for the media library table. */
export const MEDIA: [string, string, string, number, number][] = [
  [`${IMG}/logo.png`, "gruk-logo.png", "logo", 240, 240],
  [`${IMG}/cover.jpg`, "gruk-cover.jpg", "cover", 1920, 1080],
  [`${IMG}/hero.jpg`, "gruk-hero.jpg", "hero", 1920, 1080],
  [`${IMG}/about.jpg`, "gruk-about.jpg", "website", 1920, 1080],
  [`${IMG}/menu-banner.jpg`, "gruk-menu-banner.jpg", "website", 1920, 640],
  ...["hands-on", "the-og", "slider-squad", "wing-night"].map(
    (name): [string, string, string, number, number] => [gal(name), `gruk-${name}.jpg`, "gallery", 1600, 1067],
  ),
];
