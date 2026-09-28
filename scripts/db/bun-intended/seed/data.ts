/**
 * Bun Intended — fictional Gen-Z smash-burger brand (Karachi). Complete demo tenant, inserted through the real
 * schema by ./seed.ts. Images live in ../images and are copied to /public/images/bun-intended by the seed.
 * Everything here (brand, people, orders, reviews) is invented.
 */

/** Deterministic, valid v4-shaped uuids: group = kind of row, n = ordinal. Prefix b0b5 is this tenant's own. */
const uid = (group: number, n: number): string =>
  `b0b5${group.toString(16).padStart(4, "0")}-eeee-4eee-8eee-${n.toString().padStart(12, "0")}`;

export const IDS = {
  restaurant: uid(1, 1),
  locationClifton: uid(2, 1),
  locationDha: uid(2, 2),
  website: uid(3, 1),
  pageHome: uid(4, 1),
  pageAbout: uid(4, 2),
  pageContact: uid(4, 3),
  pageMenu: uid(4, 4),
  pageReservation: uid(4, 5),
  pageReviews: uid(4, 6),
  pageLocations: uid(4, 7),
  zoneClifton: uid(5, 1),
  zoneCentral: uid(5, 2),
  zoneDha: uid(5, 3),
  zoneEast: uid(5, 4),
  couponWelcome: uid(6, 1),
  couponStudent: uid(6, 2),
  couponFreeDelivery: uid(6, 3),
  couponExpired: uid(6, 4),
  memberOwner: uid(7, 1),
  memberAdmin: uid(7, 2),
  memberManager: uid(7, 3),
  memberStaff: uid(7, 4),
  userOwner: uid(8, 1),
  userAdmin: uid(8, 2),
  userManager: uid(8, 3),
  userStaff: uid(8, 4),
} as const;

export const SLUG = "bun-intended";
const BASE = `/r/${SLUG}`;
const IMG = `/images/${SLUG}`;

export const RESTAURANT = {
  name: "Bun Intended",
  slug: SLUG,
  legalName: "Bun Intended Foods (Pvt) Ltd",
  tagline: "Smashed. Stacked. Slightly unhinged.",
  city: "Karachi",
  shortDescription: "Smash burgers, crispy chicken and loaded fries, open till 3 am — Karachi's loudest burger drop.",
  description:
    "Bun Intended started as a flat-top at a Clifton food festival and a queue that wouldn't go home. We smash fresh never-frozen beef on a screaming-hot griddle, fry our chicken to order and toast every potato bun in butter. Two spots in Karachi, open late, zero boring burgers.",
  cuisines: ["Burgers", "Fast Food", "Fried Chicken", "Shakes"],
  phone: "+92 21 3587 0420",
  whatsapp: "+92 333 2860 420",
  email: "hello@bunintended.pk",
  websiteUrl: "https://bunintended.pk",
  currency: "PKR",
  currencySymbol: "Rs",
  timezone: "Asia/Karachi",
  social: {
    instagram: "https://instagram.com/bunintended.pk",
    tiktok: "https://tiktok.com/@bunintended.pk",
    facebook: "https://facebook.com/bunintended.pk",
  },
  logo: `${IMG}/logo.svg`,
  cover: `${IMG}/cover.jpg`,
};

export const SETTINGS = {
  tax: { enabled: true, rate: 16, included: false, applyOnDeliveryFee: false, label: "Sales tax" },
  serviceFee: { enabled: false, rate: 0, orderTypes: ["dine_in"] },
  ordering: {
    onlineOrderingEnabled: true,
    minimumOrderAmount: 700,
    maxAdvanceDays: 2,
    allowScheduledOrders: true,
    preparationTimeMinutes: 12,
    packagingCharge: 0,
    requirePhoneVerification: false,
  },
  payments: {
    enabledMethods: ["cash_on_delivery", "cash", "card_online", "card_terminal"],
    onlineProvider: "none",
    payAtStoreEnabled: true,
  },
  // Walk-in burger joint: no table bookings.
  reservations: {
    enabled: false,
    slotMinutes: 30,
    minGuests: 1,
    maxGuests: 6,
    autoConfirm: false,
    maxAdvanceDays: 7,
    defaultDurationMinutes: 60,
    tables: [],
  },
  delivery: { enabled: true, defaultEtaMinutes: 35, freeDeliveryOver: null, trackingEnabled: true },
  loyalty: { enabled: false, pointsPerCurrencyUnit: 1, redeemRate: 0.01 },
  receipt: { footerNote: "Thanks for eating with Bun Intended. Tag us @bunintended.pk", showTaxNumber: false },
};

export const FEATURES = {
  onlineOrdering: true,
  delivery: true,
  pickup: true,
  dineIn: true,
  reservations: false,
  reviews: true,
  coupons: true,
  loyalty: false,
  gallery: true,
  customDomain: false,
  analytics: true,
  onlinePayments: false,
  notifications: true,
  notificationChannels: { emailNotify: true, pushNotify: true },
};

const LATE = [{ open: "13:00", close: "03:00" }];
const LATER = [{ open: "13:00", close: "04:00" }];
const HOURS = { mon: LATE, tue: LATE, wed: LATE, thu: LATE, fri: LATER, sat: LATER, sun: LATE };

export const LOCATIONS = [
  {
    id: IDS.locationClifton, name: "Clifton", slug: "clifton", primary: true,
    line1: "Shop 4, Block 5, Clifton", area: "Clifton", city: "Karachi", state: "Sindh",
    postalCode: "75600", phone: "+92 21 3587 0420", latitude: 24.8138, longitude: 67.0299, hours: HOURS,
    settings: { dineIn: true, parking: false },
  },
  {
    id: IDS.locationDha, name: "DHA Bukhari", slug: "dha-bukhari", primary: false,
    line1: "Plot 22-C, Bukhari Commercial, DHA Phase 6", area: "DHA Phase 6", city: "Karachi", state: "Sindh",
    postalCode: "75500", phone: "+92 21 3587 0421", latitude: 24.7936, longitude: 67.0647, hours: HOURS,
    settings: { dineIn: true, parking: true },
  },
];

/**
 * Electric grape + hot orange on black and cream. Grape carries buttons (6.4:1 with white text), orange is the
 * sticker/badge colour (3.2:1 on cream for icons and stars, 5.3:1 on black; badge text on it is black).
 */
export const THEME = {
  name: "Grape Soda",
  primary: "#5B2EFF",
  primaryForeground: "#FFFFFF",
  secondary: "#121212",
  accent: "#F25116",
  background: "#FFF4E0",
  surface: "#FFFFFF",
  foreground: "#121212",
  muted: "#5E5648",
  border: "#E6D2AE",
  font: "Poppins",
  bodyFont: "DM Sans",
  radius: "xl",
  dark: false,
  surfaceMuted: "#FFE8C2",
  surfaceDark: "#121212",
  foregroundOnDark: "#FFF4E0",
  accentForeground: "#121212",
};

export const NAV = [
  { label: "Home", href: BASE, enabled: true },
  { label: "Menu", href: `${BASE}/menu`, enabled: true },
  { label: "Our Story", href: `${BASE}/about`, enabled: true },
  { label: "Reviews", href: `${BASE}/reviews`, enabled: true },
  { label: "Locations", href: `${BASE}/locations`, enabled: true },
];

export const TEAM = [
  { id: IDS.userOwner, member: IDS.memberOwner, email: "owner@bunintended.pk", name: "Rayan Siddiqui", role: "owner", password: "BunIntended#1", phone: "+92 300 2220001" },
  { id: IDS.userAdmin, member: IDS.memberAdmin, email: "admin@bunintended.pk", name: "Emaan Shah", role: "admin", password: "BunIntended#2", phone: "+92 300 2220002" },
  { id: IDS.userManager, member: IDS.memberManager, email: "manager@bunintended.pk", name: "Taha Baig", role: "manager", password: "BunIntended#3", phone: "+92 300 2220003" },
  { id: IDS.userStaff, member: IDS.memberStaff, email: "grill@bunintended.pk", name: "Shayan Ali", role: "staff", password: "BunIntended#4", phone: "+92 300 2220004" },
];
/** Staff name written on seeded order status changes. */
export const SHIFT_LEAD = "Taha Baig";

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------
export interface SeedCategory { slug: string; name: string; description: string; image: string; icon: string; featured?: boolean }

const m = (file: string) => `${IMG}/menu/${file}.jpg`;

export const CATEGORIES: SeedCategory[] = [
  { slug: "signatures", name: "Signature Burgers", description: "The ones that went viral. Deservedly.", image: m("main-character"), icon: "star", featured: true },
  { slug: "smash", name: "Smash Burgers", description: "Fresh beef, smashed thin, crispy edges. Science.", image: m("smash-attack"), icon: "flame", featured: true },
  { slug: "classics", name: "Classic Burgers", description: "No gimmicks. Just really good burgers.", image: m("the-og"), icon: "award" },
  { slug: "crispy-chicken", name: "Crispy Chicken", description: "Buttermilk-brined, double-dredged, loud crunch.", image: m("crunch-mode"), icon: "sandwich", featured: true },
  { slug: "spicy", name: "Hot Zone", description: "Spicy on purpose. Milkshake recommended.", image: m("hot-mess"), icon: "flame" },
  { slug: "veggie", name: "Veggie", description: "No beef, no problem.", image: m("green-flag"), icon: "leaf" },
  { slug: "fries-sides", name: "Loaded Fries & Sides", description: "Fries, but make it a personality.", image: m("cheesy-af-fries"), icon: "utensils", featured: true },
  { slug: "wings-nuggets", name: "Wings & Nuggets", description: "Dunkable, shareable, un-put-down-able.", image: m("buffalo-wings"), icon: "chef-hat" },
  { slug: "sauces", name: "Sauces & Dips", description: "Our sauce is the main character. Take extra.", image: m("dip-trio"), icon: "sparkles" },
  { slug: "shakes", name: "Shakes", description: "Thick enough to need a spoon. We tried.", image: m("freak-shake"), icon: "ice-cream", featured: true },
  { slug: "drinks", name: "Drinks & Mocktails", description: "Fresh lemonades, fizzy stuff and mocktails.", image: m("red-flag"), icon: "cup-soda" },
  { slug: "combos", name: "Combos & Deals", description: "Burger + fries + drink, for less. Math that slaps.", image: m("squad-box"), icon: "users", featured: true },
];

export interface SeedVariant { name: string; price: string; isDefault?: boolean }
export interface SeedAddonGroup {
  name: string; isRequired?: boolean; minSelect?: number; maxSelect?: number;
  addons: { name: string; price: string; isDefault?: boolean; maxQuantity?: number }[];
}
export interface SeedItem {
  name: string; slug: string; category: string; image: string; price: string; compareAtPrice?: string;
  description: string; shortDescription?: string; prepTime: number; spiceLevel?: number;
  dietaryTags?: string[]; allergens?: string[]; featured?: boolean; calories?: number;
  variants?: SeedVariant[]; addonGroups?: SeedAddonGroup[];
}

/** Patty count as variants: absolute prices. */
const patties = (single: string, double: string, triple?: string): SeedVariant[] => [
  { name: "Single", price: single },
  { name: "Double", price: double, isDefault: true },
  ...(triple ? [{ name: "Triple", price: triple }] : []),
];
const LEVEL_UP: SeedAddonGroup = {
  name: "Level it up", maxSelect: 6,
  addons: [
    { name: "Extra cheese slice", price: "120.00", maxQuantity: 3 },
    { name: "Extra smash patty", price: "450.00", maxQuantity: 2 },
    { name: "Beef pepperoni", price: "220.00" },
    { name: "Fried egg", price: "150.00" },
    { name: "Jalapeños", price: "90.00" },
    { name: "Caramelised onions", price: "120.00" },
    { name: "Sautéed mushrooms", price: "160.00" },
  ],
};
const MAKE_IT_A_MEAL: SeedAddonGroup = {
  name: "Make it a meal", maxSelect: 1,
  addons: [{ name: "Fries + drink", price: "450.00" }, { name: "Cheesy AF fries + drink", price: "690.00" }],
};
const CHICKEN_HEAT: SeedAddonGroup = {
  name: "Heat", isRequired: true, minSelect: 1, maxSelect: 1,
  addons: [
    { name: "No heat", price: "0.00" },
    { name: "Mild", price: "0.00", isDefault: true },
    { name: "Hot", price: "0.00" },
    { name: "Unhinged (sign the waiver)", price: "0.00" },
  ],
};
const DIP: SeedAddonGroup = {
  name: "Dips", maxSelect: 3,
  addons: [
    { name: "Bun Sauce", price: "90.00", maxQuantity: 3 },
    { name: "Garlic mayo", price: "90.00", maxQuantity: 3 },
    { name: "Chipotle mayo", price: "90.00", maxQuantity: 3 },
    { name: "Honey mustard", price: "90.00", maxQuantity: 3 },
    { name: "Cheese sauce", price: "140.00", maxQuantity: 3 },
  ],
};
const SHAKE_EXTRAS: SeedAddonGroup = {
  name: "Extras", maxSelect: 3,
  addons: [{ name: "Whipped cream", price: "100.00" }, { name: "Extra cookie crumble", price: "120.00" }, { name: "Brownie chunks", price: "180.00" }],
};
const FIZZ: SeedVariant[] = [
  { name: "Cola", price: "250.00", isDefault: true },
  { name: "Lemon-lime", price: "250.00" },
  { name: "Orange", price: "250.00" },
];
const COMBO_DRINK: SeedAddonGroup = {
  name: "Pick your drink", isRequired: true, minSelect: 1, maxSelect: 1,
  addons: [
    { name: "Cola", price: "0.00", isDefault: true },
    { name: "Lemon-lime", price: "0.00" },
    { name: "Mint Condition lemonade", price: "150.00" },
    { name: "Upgrade to a shake", price: "450.00" },
  ],
};

export const ITEMS: SeedItem[] = [
  // ── Signature Burgers ────────────────────────────────────────────────────
  {
    name: "Main Character", slug: "main-character", category: "signatures", image: m("main-character"),
    price: "1690.00", featured: true, prepTime: 12, calories: 1150,
    shortDescription: "Double smash, Bun Sauce, pickles",
    description: "Two smashed patties, double American cheese, grilled onions, pickles and a reckless amount of Bun Sauce on a butter-toasted potato bun. Main character energy, obviously.",
    dietaryTags: ["halal"], allergens: ["gluten", "dairy", "eggs", "sesame"],
    variants: patties("1290.00", "1690.00", "2090.00"),
    addonGroups: [LEVEL_UP, MAKE_IT_A_MEAL],
  },
  {
    name: "Rich Kid", slug: "rich-kid", category: "signatures", image: m("rich-kid"),
    price: "1990.00", prepTime: 14, calories: 1080,
    description: "Smash patty, truffle mayo, sautéed mushrooms, Swiss and aged cheddar. It didn't ask for the upgrade, it just has it.",
    dietaryTags: ["halal"], allergens: ["gluten", "dairy", "eggs"],
    variants: patties("1590.00", "1990.00"),
    addonGroups: [LEVEL_UP, MAKE_IT_A_MEAL],
  },
  {
    name: "Sauce Boss", slug: "sauce-boss", category: "signatures", image: m("sauce-boss"),
    price: "1790.00", prepTime: 13, calories: 1120,
    description: "Smoky BBQ-glazed patties, crispy onion strings, cheddar and a drizzle of honey chipotle. Napkins are not optional.",
    dietaryTags: ["halal"], allergens: ["gluten", "dairy", "eggs"],
    variants: patties("1390.00", "1790.00"),
    addonGroups: [LEVEL_UP, MAKE_IT_A_MEAL],
  },
  {
    name: "Build Your Own Burger", slug: "build-your-own-burger", category: "signatures", image: m("build-your-own"),
    price: "990.00", prepTime: 14,
    shortDescription: "Your bun, your patty, your rules",
    description: "Pick a bun, a patty, a cheese and up to six toppings, then finish it with a sauce. We'll build it exactly how you asked. No judgement. Okay, a little judgement.",
    dietaryTags: ["halal"], allergens: ["gluten", "dairy", "eggs"],
    addonGroups: [
      { name: "Bun", isRequired: true, minSelect: 1, maxSelect: 1, addons: [
        { name: "Potato bun", price: "0.00", isDefault: true }, { name: "Brioche", price: "80.00" }, { name: "Charcoal bun", price: "120.00" }, { name: "Lettuce wrap", price: "0.00" },
      ] },
      { name: "Patty", isRequired: true, minSelect: 1, maxSelect: 1, addons: [
        { name: "Single smash", price: "0.00", isDefault: true }, { name: "Double smash", price: "400.00" }, { name: "Triple smash", price: "800.00" },
        { name: "Crispy chicken", price: "150.00" }, { name: "Veggie patty", price: "0.00" },
      ] },
      { name: "Cheese", isRequired: true, minSelect: 1, maxSelect: 1, addons: [
        { name: "American", price: "0.00", isDefault: true }, { name: "Cheddar", price: "60.00" }, { name: "Swiss", price: "80.00" }, { name: "Pepper jack", price: "80.00" }, { name: "No cheese", price: "0.00" },
      ] },
      { name: "Toppings", maxSelect: 6, addons: [
        { name: "Lettuce", price: "0.00" }, { name: "Tomato", price: "0.00" }, { name: "Pickles", price: "0.00" }, { name: "Grilled onions", price: "0.00" },
        { name: "Jalapeños", price: "90.00" }, { name: "Mushrooms", price: "160.00" }, { name: "Beef pepperoni", price: "220.00" }, { name: "Fried egg", price: "150.00" }, { name: "Onion strings", price: "120.00" },
      ] },
      { name: "Sauce", isRequired: true, minSelect: 1, maxSelect: 2, addons: [
        { name: "Bun Sauce", price: "0.00", isDefault: true }, { name: "Garlic mayo", price: "0.00" }, { name: "Chipotle mayo", price: "0.00" }, { name: "Smoky BBQ", price: "0.00" }, { name: "Truffle mayo", price: "120.00" },
      ] },
      MAKE_IT_A_MEAL,
    ],
  },

  // ── Smash Burgers ────────────────────────────────────────────────────────
  {
    name: "Smash Attack", slug: "smash-attack", category: "smash", image: m("smash-attack"),
    price: "1490.00", featured: true, prepTime: 10, calories: 980,
    description: "Two thin-smashed patties with lacy crispy edges, melted cheddar, caramelised onions and pickles. The one that started the queue.",
    dietaryTags: ["halal"], allergens: ["gluten", "dairy", "eggs"],
    variants: patties("1090.00", "1490.00"),
    addonGroups: [LEVEL_UP, MAKE_IT_A_MEAL],
  },
  {
    name: "Double Trouble", slug: "double-trouble", category: "smash", image: m("double-trouble"),
    price: "1590.00", prepTime: 10, calories: 1060,
    description: "Double patty, double cheese, double Bun Sauce. We don't do things halfway and neither should you.",
    dietaryTags: ["halal"], allergens: ["gluten", "dairy", "eggs", "sesame"],
    addonGroups: [LEVEL_UP, MAKE_IT_A_MEAL],
  },
  {
    name: "Triple Threat", slug: "triple-threat", category: "smash", image: m("triple-threat"),
    price: "2190.00", prepTime: 12, calories: 1480,
    description: "Three smash patties, three slices of cheese and crispy beef pepperoni. Not a burger, a commitment.",
    dietaryTags: ["halal"], allergens: ["gluten", "dairy", "eggs"],
    addonGroups: [LEVEL_UP, MAKE_IT_A_MEAL],
  },

  // ── Classic Burgers ──────────────────────────────────────────────────────
  {
    name: "The OG", slug: "the-og", category: "classics", image: m("the-og"),
    price: "1090.00", prepTime: 10, calories: 720,
    description: "One beef patty, cheese, lettuce, tomato, onion, pickles, ketchup and mustard. The classic, done properly.",
    dietaryTags: ["halal"], allergens: ["gluten", "dairy", "eggs"],
    variants: patties("1090.00", "1490.00"),
    addonGroups: [LEVEL_UP, MAKE_IT_A_MEAL],
  },
  {
    name: "Big Mood", slug: "big-mood", category: "classics", image: m("big-mood"),
    price: "1390.00", prepTime: 11, calories: 890,
    description: "Thick flame-grilled quarter-pounder, cheddar, crunchy lettuce, tomato and garlic mayo on a sesame bun. A whole vibe.",
    dietaryTags: ["halal"], allergens: ["gluten", "dairy", "eggs", "sesame"],
    addonGroups: [LEVEL_UP, MAKE_IT_A_MEAL],
  },

  // ── Crispy Chicken ───────────────────────────────────────────────────────
  {
    name: "Crunch Mode", slug: "crunch-mode", category: "crispy-chicken", image: m("crunch-mode"),
    price: "1290.00", featured: true, prepTime: 12, calories: 860,
    description: "Buttermilk-brined thigh, double-dredged and fried loud, with slaw, pickles and chipotle mayo. You'll hear it before you taste it.",
    dietaryTags: ["halal"], allergens: ["gluten", "dairy", "eggs"],
    addonGroups: [CHICKEN_HEAT, LEVEL_UP, MAKE_IT_A_MEAL],
  },
  {
    name: "Crispy Era", slug: "crispy-era", category: "crispy-chicken", image: m("crispy-era"),
    price: "1190.00", prepTime: 12, calories: 780,
    description: "Crispy chicken fillet, lettuce, tomato and garlic mayo. Simple, crunchy, emotionally stable.",
    dietaryTags: ["halal"], allergens: ["gluten", "dairy", "eggs"],
    addonGroups: [CHICKEN_HEAT, LEVEL_UP, MAKE_IT_A_MEAL],
  },

  // ── Hot Zone ─────────────────────────────────────────────────────────────
  {
    name: "Hot Mess", slug: "hot-mess", category: "spicy", image: m("hot-mess"),
    price: "1590.00", featured: true, prepTime: 12, spiceLevel: 3, calories: 1020,
    description: "Double smash, ghost-pepper cheese, fried jalapeños and sriracha mayo on a red chilli bun. Chaotic. Delicious. A lot like your group chat.",
    dietaryTags: ["halal"], allergens: ["gluten", "dairy", "eggs"],
    addonGroups: [LEVEL_UP, MAKE_IT_A_MEAL],
  },
  {
    name: "Nashville Unhinged", slug: "nashville-unhinged", category: "spicy", image: m("nashville-unhinged"),
    price: "1390.00", prepTime: 13, spiceLevel: 3, calories: 910,
    description: "Crispy chicken dunked in Nashville hot oil, with pickles, slaw and cooling ranch. Pick your heat, then regret nothing.",
    dietaryTags: ["halal"], allergens: ["gluten", "dairy", "eggs"],
    addonGroups: [CHICKEN_HEAT, MAKE_IT_A_MEAL],
  },
  {
    name: "Hot Take", slug: "hot-take", category: "spicy", image: m("hot-take"),
    price: "1490.00", prepTime: 12, spiceLevel: 2, calories: 940,
    description: "Smash patty, pepper jack, jalapeño relish and smashed avocado crema. Controversial? Only until you try it.",
    dietaryTags: ["halal"], allergens: ["gluten", "dairy", "eggs"],
    addonGroups: [LEVEL_UP, MAKE_IT_A_MEAL],
  },

  // ── Veggie ───────────────────────────────────────────────────────────────
  {
    name: "Green Flag", slug: "green-flag", category: "veggie", image: m("green-flag"),
    price: "1190.00", prepTime: 12, calories: 690,
    description: "Crispy black-bean and corn patty, smashed avocado, pepper jack, pickled onions and chipotle mayo. The healthiest decision you'll make tonight.",
    dietaryTags: ["vegetarian"], allergens: ["gluten", "dairy", "eggs"],
    addonGroups: [MAKE_IT_A_MEAL],
  },

  // ── Loaded Fries & Sides ─────────────────────────────────────────────────
  {
    name: "Cheesy AF Fries", slug: "cheesy-af-fries", category: "fries-sides", image: m("cheesy-af-fries"),
    price: "790.00", featured: true, prepTime: 8,
    description: "Crispy fries drowned in molten cheese sauce, jalapeños, crispy onions and Bun Sauce. Share if you must.",
    dietaryTags: ["vegetarian"], allergens: ["dairy", "eggs"],
    addonGroups: [{ name: "Load it more", maxSelect: 2, addons: [{ name: "Smashed beef crumble", price: "350.00" }, { name: "Crispy chicken bits", price: "300.00" }] }],
  },
  {
    name: "Garlic Parm Fries", slug: "garlic-parm-fries", category: "fries-sides", image: m("garlic-parm-fries"),
    price: "690.00", prepTime: 7,
    description: "Fries tossed in garlic butter, parmesan and parsley. Smells incredible, tastes better.",
    dietaryTags: ["vegetarian", "gluten-free"], allergens: ["dairy"],
  },
  {
    name: "Peri Peri Fries", slug: "peri-peri-fries", category: "fries-sides", image: m("peri-fries"),
    price: "590.00", prepTime: 6, spiceLevel: 1,
    description: "Crispy fries dusted in our peri peri spice.",
    dietaryTags: ["vegan", "gluten-free"],
    variants: [{ name: "Regular", price: "590.00", isDefault: true }, { name: "Large", price: "790.00" }],
  },
  {
    name: "Classic Fries", slug: "classic-fries", category: "fries-sides", image: m("classic-fries"),
    price: "450.00", prepTime: 5,
    description: "Skin-on, double-fried, salted right. The reliable friend.",
    dietaryTags: ["vegan", "gluten-free"],
    variants: [{ name: "Regular", price: "450.00", isDefault: true }, { name: "Large", price: "650.00" }],
    addonGroups: [DIP],
  },
  {
    name: "Onion Rings", slug: "onion-rings", category: "fries-sides", image: m("onion-rings"),
    price: "590.00", prepTime: 7,
    description: "Thick-cut rings in a crunchy beer-free batter, with Bun Sauce.",
    dietaryTags: ["vegetarian"], allergens: ["gluten", "eggs"],
    addonGroups: [DIP],
  },

  // ── Wings & Nuggets ──────────────────────────────────────────────────────
  {
    name: "Buffalo Wings", slug: "buffalo-wings", category: "wings-nuggets", image: m("buffalo-wings"),
    price: "990.00", featured: true, prepTime: 14, spiceLevel: 2,
    description: "Crispy wings tossed in tangy buffalo sauce, with ranch for dunking.",
    dietaryTags: ["halal", "gluten-free"], allergens: ["dairy"],
    variants: [{ name: "6 pieces", price: "990.00", isDefault: true }, { name: "12 pieces", price: "1790.00" }],
    addonGroups: [DIP],
  },
  {
    name: "Sticky Situation Wings", slug: "sticky-situation-wings", category: "wings-nuggets", image: m("sticky-wings"),
    price: "1050.00", prepTime: 14, spiceLevel: 1,
    description: "Wings glazed in honey, garlic and chilli. Sticky fingers guaranteed.",
    dietaryTags: ["halal"], allergens: ["soy", "sesame"],
    variants: [{ name: "6 pieces", price: "1050.00", isDefault: true }, { name: "12 pieces", price: "1890.00" }],
    addonGroups: [DIP],
  },
  {
    name: "Nug Life", slug: "nug-life", category: "wings-nuggets", image: m("nuggets"),
    price: "690.00", prepTime: 8,
    description: "Crispy chicken nuggets made from whole breast meat. Pick your dips.",
    dietaryTags: ["halal"], allergens: ["gluten", "eggs"],
    variants: [{ name: "6 pieces", price: "690.00", isDefault: true }, { name: "10 pieces", price: "990.00" }, { name: "20 pieces", price: "1790.00" }],
    addonGroups: [DIP],
  },
  {
    name: "Tender Era Strips", slug: "tender-era-strips", category: "wings-nuggets", image: m("tenders"),
    price: "890.00", prepTime: 10,
    description: "Four buttermilk chicken tenders, crispy outside, juicy inside.",
    dietaryTags: ["halal"], allergens: ["gluten", "dairy", "eggs"],
    addonGroups: [CHICKEN_HEAT, DIP],
  },

  // ── Sauces & Dips ────────────────────────────────────────────────────────
  {
    name: "Sauce Pot", slug: "sauce-pot", category: "sauces", image: m("sauce-pot"),
    price: "120.00", prepTime: 1,
    description: "A pot of your favourite. Bun Sauce is our secret recipe — tangy, smoky, slightly sweet.",
    dietaryTags: ["vegetarian"], allergens: ["eggs"],
    variants: [
      { name: "Bun Sauce", price: "120.00", isDefault: true },
      { name: "Garlic mayo", price: "120.00" },
      { name: "Chipotle mayo", price: "120.00" },
      { name: "Honey mustard", price: "120.00" },
      { name: "Sriracha mayo", price: "120.00" },
      { name: "Cheese sauce", price: "180.00" },
    ],
  },
  {
    name: "Dip Trio", slug: "dip-trio", category: "sauces", image: m("dip-trio"),
    price: "320.00", prepTime: 1,
    description: "Bun Sauce, garlic mayo and chipotle mayo. Because choosing is hard.",
    dietaryTags: ["vegetarian"], allergens: ["eggs"],
  },

  // ── Shakes ───────────────────────────────────────────────────────────────
  {
    name: "Cookie Crumble Shake", slug: "cookie-crumble-shake", category: "shakes", image: m("cookie-shake"),
    price: "890.00", featured: true, prepTime: 5,
    description: "Vanilla ice cream blended with chocolate cookies and topped with more cookies. Obviously.",
    dietaryTags: ["vegetarian"], allergens: ["dairy", "gluten"],
    addonGroups: [SHAKE_EXTRAS],
  },
  {
    name: "Unhinged Freakshake", slug: "unhinged-freakshake", category: "shakes", image: m("freak-shake"),
    price: "1290.00", prepTime: 7,
    description: "Chocolate shake with a Nutella-dipped rim, brownie chunks, whipped cream and a cookie on top. Built for the photo, worth the calories.",
    dietaryTags: ["vegetarian"], allergens: ["dairy", "gluten", "nuts", "eggs"],
  },
  {
    name: "Pink Era Strawberry Shake", slug: "pink-era-shake", category: "shakes", image: m("strawberry-shake"),
    price: "790.00", prepTime: 5,
    description: "Real strawberries, vanilla ice cream and a lot of pink.",
    dietaryTags: ["vegetarian", "gluten-free"], allergens: ["dairy"],
    addonGroups: [SHAKE_EXTRAS],
  },
  {
    name: "Choc Therapy Shake", slug: "choc-therapy-shake", category: "shakes", image: m("choc-shake"),
    price: "790.00", prepTime: 5,
    description: "Belgian chocolate shake. Cheaper than therapy, probably.",
    dietaryTags: ["vegetarian", "gluten-free"], allergens: ["dairy"],
    addonGroups: [SHAKE_EXTRAS],
  },

  // ── Drinks & Mocktails ───────────────────────────────────────────────────
  {
    name: "Mint Condition Lemonade", slug: "mint-condition-lemonade", category: "drinks", image: m("mint-lemonade"),
    price: "450.00", prepTime: 3,
    description: "Fresh lemon, mint and crushed ice. Tastes like the first day of summer break.",
    dietaryTags: ["vegan", "gluten-free"],
    variants: [{ name: "Regular", price: "450.00", isDefault: true }, { name: "Jug · 1 L", price: "1190.00" }],
  },
  {
    name: "Red Flag Mocktail", slug: "red-flag-mocktail", category: "drinks", image: m("red-flag"),
    price: "590.00", prepTime: 4,
    description: "Strawberry, lime and sparkling water. The only red flag you should ignore.",
    dietaryTags: ["vegan", "gluten-free"],
  },
  {
    name: "Main Squeeze Lemonade", slug: "main-squeeze-lemonade", category: "drinks", image: m("lemonade"),
    price: "450.00", prepTime: 3,
    description: "Fresh-squeezed lemonade with a splash of passion fruit.",
    dietaryTags: ["vegan", "gluten-free"],
  },
  {
    name: "Fizzy Drinks", slug: "fizzy-drinks", category: "drinks", image: m("lemonade"),
    price: "250.00", prepTime: 1,
    description: "Ice-cold 345 ml can.",
    dietaryTags: ["vegan", "gluten-free"],
    variants: FIZZ,
  },

  // ── Combos & Deals (compare-at price = the "Offer" badge) ────────────────
  {
    name: "Broke Student Combo", slug: "broke-student-combo", category: "combos", image: m("student-combo"),
    price: "1390.00", compareAtPrice: "1790.00", featured: true, prepTime: 12,
    shortDescription: "The OG + fries + drink",
    description: "The OG burger, classic fries and a drink. Show your student card for the deal. Budget-friendly, taste-rich.",
    dietaryTags: ["halal"], allergens: ["gluten", "dairy", "eggs"],
    addonGroups: [COMBO_DRINK],
  },
  {
    name: "Situationship Combo", slug: "situationship-combo", category: "combos", image: m("duo-combo"),
    price: "3290.00", compareAtPrice: "3990.00", featured: true, prepTime: 14,
    shortDescription: "2 burgers + 2 fries + 2 drinks",
    description: "Two signature burgers of your choice, two fries and two drinks. It's not a date. Unless it is.",
    dietaryTags: ["halal"], allergens: ["gluten", "dairy", "eggs"],
    addonGroups: [
      { name: "Burger 1", isRequired: true, minSelect: 1, maxSelect: 1, addons: [{ name: "Main Character", price: "0.00", isDefault: true }, { name: "Smash Attack", price: "0.00" }, { name: "Crunch Mode", price: "0.00" }, { name: "Hot Mess", price: "100.00" }] },
      { name: "Burger 2", isRequired: true, minSelect: 1, maxSelect: 1, addons: [{ name: "Main Character", price: "0.00", isDefault: true }, { name: "Smash Attack", price: "0.00" }, { name: "Crunch Mode", price: "0.00" }, { name: "Green Flag", price: "0.00" }] },
    ],
  },
  {
    name: "Group Chat Box", slug: "group-chat-box", category: "combos", image: m("squad-box"),
    price: "6490.00", compareAtPrice: "7990.00", featured: true, prepTime: 18,
    shortDescription: "4 burgers + wings + 2 large fries + 4 drinks",
    description: "Four burgers, 12 wings, two large fries, four drinks and a Dip Trio. For when the group chat finally agrees on something.",
    dietaryTags: ["halal"], allergens: ["gluten", "dairy", "eggs"],
    variants: [{ name: "Serves 4", price: "6490.00", isDefault: true }, { name: "Serves 6", price: "9290.00" }],
  },
  {
    name: "3 AM Thoughts Combo", slug: "3am-thoughts-combo", category: "combos", image: m("late-night-combo"),
    price: "1690.00", compareAtPrice: "2090.00", prepTime: 12,
    shortDescription: "Crispy Era + Cheesy AF fries + drink",
    description: "Crispy Era burger, Cheesy AF fries and a drink. Available all night, for obvious reasons.",
    dietaryTags: ["halal"], allergens: ["gluten", "dairy", "eggs"],
    addonGroups: [COMBO_DRINK],
  },
  {
    name: "Wing It Bucket", slug: "wing-it-bucket", category: "combos", image: m("bucket"),
    price: "2890.00", compareAtPrice: "3490.00", prepTime: 16, spiceLevel: 1,
    description: "Eight pieces of crispy fried chicken, 10 nuggets, large fries and three dips. Wing it. Literally.",
    dietaryTags: ["halal"], allergens: ["gluten", "dairy", "eggs"],
  },
];

export const ZONES = [
  { id: IDS.zoneClifton, locationId: IDS.locationClifton, name: "Clifton & Boat Basin", description: "Fresh off the Clifton flat-top.",
    areas: ["Clifton", "Boat Basin", "Bath Island", "Block 2", "Block 5", "Block 9"], postalCodes: ["75600"], fee: "150.00", minOrder: "900.00", freeOver: "3500.00", etaMin: 20, etaMax: 35 },
  { id: IDS.zoneCentral, locationId: IDS.locationClifton, name: "Saddar, PECHS & Tariq Road", areas: ["Saddar", "PECHS", "Tariq Road", "Bahadurabad"], postalCodes: ["75400"], fee: "220.00", minOrder: "1200.00", freeOver: null, etaMin: 35, etaMax: 50 },
  { id: IDS.zoneDha, locationId: IDS.locationDha, name: "DHA Phases 2–8", description: "Fresh off the Bukhari flat-top.", areas: ["DHA Phase 2", "DHA Phase 5", "DHA Phase 6", "DHA Phase 7", "DHA Phase 8", "Bukhari Commercial", "Ittehad"], postalCodes: ["75500"], fee: "150.00", minOrder: "900.00", freeOver: "3500.00", etaMin: 20, etaMax: 35 },
  { id: IDS.zoneEast, locationId: IDS.locationDha, name: "Korangi Road & Defence View", areas: ["Korangi Road", "Defence View", "Qayyumabad"], postalCodes: ["75190"], fee: "250.00", minOrder: "1500.00", freeOver: null, etaMin: 35, etaMax: 55 },
];

export const COUPONS = [
  { id: IDS.couponWelcome, code: "FIRSTBITE", description: "20% off your first order", type: "percentage", value: "20.00", minOrder: "1200.00", maxDiscount: "500.00", appliesTo: "order", usageLimit: 1000, perCustomer: 1, startsAt: -30, endsAt: 150, active: true },
  { id: IDS.couponStudent, code: "BROKEBUTHUNGRY", description: "Rs 250 off orders above Rs 2,000", type: "fixed", value: "250.00", minOrder: "2000.00", maxDiscount: null, appliesTo: "order", usageLimit: null, perCustomer: 5, startsAt: -60, endsAt: 120, active: true },
  { id: IDS.couponFreeDelivery, code: "FREESHIP", description: "Free delivery on orders above Rs 2,500", type: "fixed", value: "250.00", minOrder: "2500.00", maxDiscount: null, appliesTo: "delivery_fee", usageLimit: 500, perCustomer: null, startsAt: -10, endsAt: 60, active: true },
  { id: IDS.couponExpired, code: "LAUNCHDAY", description: "30% launch-day drop (expired)", type: "percentage", value: "30.00", minOrder: "1000.00", maxDiscount: "600.00", appliesTo: "order", usageLimit: 300, perCustomer: 1, startsAt: -400, endsAt: -390, active: true },
];

// ---------------------------------------------------------------------------
// People, reviews, orders (fictional; example.com addresses). Reservations are off for this brand.
// ---------------------------------------------------------------------------
const c = (n: number) => uid(9, n);
export const CUSTOMERS = [
  { id: c(1), name: "Aleena Hashmi", phone: "+92 300 3331101", email: "aleena.hashmi@example.com", account: false, address: { label: "Home", line1: "Flat 12, Sea Breeze Apartments, Block 2", area: "Clifton", city: "Karachi", postalCode: "75600" } },
  { id: c(2), name: "Zohaib Memon", phone: "+92 321 3331102", email: "zohaib.memon@example.com", account: false, address: { label: "Hostel", line1: "Room 214, Boys Hostel", area: "PECHS", city: "Karachi", postalCode: "75400" } },
  { id: c(3), name: "Inaya Rizvi", phone: "+92 333 3331103", email: "inaya.rizvi@example.com", account: true, address: { label: "Home", line1: "House 18, Street 7", area: "DHA Phase 6", city: "Karachi", postalCode: "75500" } },
  { id: c(4), name: "Hamza Qadri", phone: "+92 345 3331104", email: "hamza.qadri@example.com", account: false, address: { label: "Home", line1: "House 40, Khayaban-e-Ittehad", area: "DHA Phase 7", city: "Karachi", postalCode: "75500" } },
  { id: c(5), name: "Mishal Ahmed", phone: "+92 301 3331105", email: "mishal.ahmed@example.com", account: false, address: { label: "Home", line1: "Flat 5B, Defence View Heights", area: "Defence View", city: "Karachi", postalCode: "75190" } },
  { id: c(6), name: "Faraz Khan", phone: "+92 302 3331106", email: "faraz.khan@example.com", account: false, address: { label: "Studio", line1: "Unit 9, Boat Basin Market", area: "Clifton", city: "Karachi", postalCode: "75600" } },
  { id: c(7), name: "Hoorain Naqvi", phone: "+92 311 3331107", email: "hoorain.naqvi@example.com", account: true, address: { label: "Home", line1: "House 3, Block 5", area: "Clifton", city: "Karachi", postalCode: "75600" } },
  { id: c(8), name: "Daniyal Sheikh", phone: "+92 336 3331108", email: "daniyal.sheikh@example.com", account: false, address: { label: "Home", line1: "House 77, Block 6", area: "PECHS", city: "Karachi", postalCode: "75400" } },
];
const cust = (n: number) => CUSTOMERS[n - 1]!;

export const REVIEWS = [
  { customer: 1, itemSlug: "main-character", author: "Aleena Hashmi", rating: 5, title: "Lives up to the hype", comment: "Crispy edges, melty cheese and that sauce. I'd queue for it again, and I hate queues.", status: "approved", featured: true, daysAgo: 2 },
  { customer: 2, itemSlug: "broke-student-combo", author: "Zohaib Memon", rating: 5, title: "Saved my exam week", comment: "Proper burger, fries and a drink under 1,400. Arrived hot at 2 am. Respect.", status: "approved", featured: true, daysAgo: 4 },
  { customer: 3, itemSlug: "cheesy-af-fries", author: "Inaya Rizvi", rating: 5, title: "The name is accurate", comment: "So much cheese sauce. The jalapeños and crispy onions make it. Ordering these on their own next time.", status: "approved", featured: true, daysAgo: 6 },
  { customer: 4, itemSlug: "hot-mess", author: "Hamza Qadri", rating: 4, title: "Actually spicy", comment: "Not fake spicy, actually spicy. Great burger. Get the shake, trust me.", status: "approved", featured: false, daysAgo: 9 },
  { customer: 5, itemSlug: "unhinged-freakshake", author: "Mishal Ahmed", rating: 5, title: "Came for the photo, stayed for the taste", comment: "It looks insane and it tastes even better. Split it with two friends and still couldn't finish.", status: "approved", featured: true, daysAgo: 12 },
  { customer: 6, itemSlug: "crunch-mode", author: "Faraz Khan", rating: 5, title: "The crunch is real", comment: "Best crispy chicken burger in Karachi. Still juicy inside. The slaw balances it perfectly.", status: "approved", featured: false, daysAgo: 15 },
  { customer: null, itemSlug: "group-chat-box", author: "Sana K.", rating: 4, title: "Fed six of us", comment: "Great value for a group. Wish there were more dip options in the box, but no complaints otherwise.", status: "approved", featured: false, daysAgo: 20 },
  { customer: 7, itemSlug: "green-flag", author: "Hoorain Naqvi", rating: 5, title: "Veggie that slaps", comment: "Finally a veggie burger that isn't an afterthought. The avocado and chipotle combo is perfect.", status: "pending", featured: false, daysAgo: 1 },
  { customer: null, itemSlug: "classic-fries", author: "Anonymous", rating: 2, title: "Fries went soggy", comment: "Long delivery and the fries were soft by the time they arrived.", status: "rejected", featured: false, daysAgo: 24 },
];

export const RESERVATIONS: {
  customer: number; daysAhead: number; time: string; guests: number; table: string | null;
  status: string; occasion: string | null; requests: string | null;
}[] = [];

export interface SeedOrder {
  customer: number;
  location: "clifton" | "dha";
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
  { customer: 1, location: "clifton", orderType: "delivery", status: "pending", hoursAgo: 0.2, zoneId: IDS.zoneClifton, paymentMethod: "cash_on_delivery", paymentStatus: "pending", couponCode: "FIRSTBITE", notes: "Extra Bun Sauce pls.",
    items: [{ slug: "main-character", quantity: 2, variant: "Double", addons: ["Jalapeños", "Fries + drink"] }, { slug: "cookie-crumble-shake", quantity: 1 }] },
  { customer: 2, location: "clifton", orderType: "delivery", status: "confirmed", hoursAgo: 0.5, zoneId: IDS.zoneCentral, paymentMethod: "cash_on_delivery", paymentStatus: "pending",
    items: [{ slug: "broke-student-combo", quantity: 2, addons: ["Cola"] }, { slug: "nug-life", quantity: 1, variant: "10 pieces", addons: ["Bun Sauce"] }] },
  { customer: 3, location: "dha", orderType: "delivery", status: "preparing", hoursAgo: 0.7, zoneId: IDS.zoneDha, paymentMethod: "cash_on_delivery", paymentStatus: "pending", couponCode: "BROKEBUTHUNGRY",
    items: [{ slug: "build-your-own-burger", quantity: 1, addons: ["Brioche", "Double smash", "Cheddar", "Pickles", "Grilled onions", "Jalapeños", "Chipotle mayo"] }, { slug: "cheesy-af-fries", quantity: 1 }, { slug: "red-flag-mocktail", quantity: 2 }] },
  { customer: 4, location: "dha", orderType: "pickup", status: "ready", hoursAgo: 0.4, paymentMethod: "card_terminal", paymentStatus: "pending",
    items: [{ slug: "hot-mess", quantity: 1, addons: ["Fries + drink"] }, { slug: "choc-therapy-shake", quantity: 1 }] },
  { customer: 5, location: "dha", orderType: "delivery", status: "out_for_delivery", hoursAgo: 0.9, zoneId: IDS.zoneEast, paymentMethod: "cash_on_delivery", paymentStatus: "pending", couponCode: "FREESHIP",
    items: [{ slug: "group-chat-box", quantity: 1, variant: "Serves 4" }] },
  { customer: 6, location: "clifton", orderType: "delivery", status: "completed", hoursAgo: 22, zoneId: IDS.zoneClifton, paymentMethod: "cash_on_delivery", paymentStatus: "paid",
    items: [{ slug: "crunch-mode", quantity: 2, addons: ["Hot", "Cheesy AF fries + drink"] }] },
  { customer: 7, location: "clifton", orderType: "dine_in", status: "completed", hoursAgo: 28, tableNumber: "Counter 3", guests: 2, paymentMethod: "card_terminal", paymentStatus: "paid",
    items: [{ slug: "situationship-combo", quantity: 1, addons: ["Smash Attack", "Green Flag"] }, { slug: "unhinged-freakshake", quantity: 1 }] },
  { customer: 3, location: "dha", orderType: "pickup", status: "completed", hoursAgo: 50, paymentMethod: "card_terminal", paymentStatus: "paid",
    items: [{ slug: "buffalo-wings", quantity: 1, variant: "12 pieces", addons: ["Garlic mayo"] }, { slug: "garlic-parm-fries", quantity: 1 }, { slug: "mint-condition-lemonade", quantity: 1, variant: "Jug · 1 L" }] },
  { customer: 8, location: "clifton", orderType: "delivery", status: "completed", hoursAgo: 73, zoneId: IDS.zoneCentral, paymentMethod: "cash_on_delivery", paymentStatus: "paid",
    items: [{ slug: "3am-thoughts-combo", quantity: 2, addons: ["Upgrade to a shake"] }] },
  { customer: 2, location: "clifton", orderType: "delivery", status: "cancelled", hoursAgo: 98, zoneId: IDS.zoneCentral, paymentMethod: "cash_on_delivery", paymentStatus: "cancelled", notes: "Customer cancelled — ordered to the wrong hostel.",
    items: [{ slug: "wing-it-bucket", quantity: 1 }] },
];

export { cust };

// ---------------------------------------------------------------------------
// Website content
// ---------------------------------------------------------------------------
const gal = (file: string) => `${IMG}/gallery/${file}.jpg`;

export const WEBSITE_CONFIG = {
  announcement: {
    enabled: true,
    text: "New drop: the Hot Mess is back. Use FIRSTBITE for 20% off your first order",
    linkLabel: "Order now",
    linkHref: `${BASE}/menu`,
  },
  navigation: { items: NAV, showCart: true, sticky: true, tone: "dark" },
  footer: {
    tagline: "Smashed. Stacked. Slightly unhinged. Open till 3 am in Clifton and DHA.",
    columns: [
      { title: "Eat", links: [
        { label: "Full menu", href: `${BASE}/menu`, enabled: true },
        { label: "Combos & deals", href: `${BASE}/menu` },
        { label: "Reviews", href: `${BASE}/reviews`, enabled: true },
      ] },
      { title: "Us", links: [
        { label: "Our story", href: `${BASE}/about` },
        { label: "Locations", href: `${BASE}/locations`, enabled: true },
        { label: "Contact", href: `${BASE}/contact` },
      ] },
    ],
    legalNote: "Prices exclude sales tax, shown at checkout. All beef and chicken is halal.",
  },
  ordering: { defaultOrderType: "delivery", allowGuestCheckout: true, showPrepTime: true, ctaLabel: "Order now" },
  contact: { email: RESTAURANT.email, showWhatsapp: true },
  social: { instagram: RESTAURANT.social.instagram, facebook: RESTAURANT.social.facebook },
};

export const HOME_SECTIONS = [
  {
    type: "hero", enabled: true, eyebrow: "Karachi's loudest burger drop",
    title: "Burgers with main character energy.",
    subtitle: "Smashed thin, stacked high, slightly unhinged. Delivered hot till 3 am.",
    image: { url: `${IMG}/hero.jpg`, alt: "A double cheeseburger from Bun Intended" },
    alignment: "left", overlay: 0.5, height: "full",
    primaryCta: { label: "Order Now", href: `${BASE}/menu`, style: "primary" },
    secondaryCta: { label: "Explore Menu", href: `${BASE}/menu`, style: "outline" },
    highlights: ["Fresh, never frozen", "100% halal", "Open till 3 am"],
  },
  {
    type: "featured_items", enabled: true, title: "The signature lineup", subtitle: "Six burgers. Zero boring. Pick your fighter.",
    itemSlugs: ["main-character", "smash-attack", "hot-mess", "crunch-mode", "rich-kid", "green-flag"],
    limit: 6, layout: "grid", cta: { label: "See every burger", href: `${BASE}/menu`, style: "outline" },
  },
  {
    type: "cta", enabled: true, title: "Build your burger. Your rules.",
    subtitle: "Pick your bun, stack up to three patties, choose a cheese, go wild with toppings and finish it with your sauce.",
    tone: "primary", cta: { label: "Start building", href: `${BASE}/menu/build-your-own-burger`, style: "primary" },
  },
  {
    type: "menu_preview", enabled: true, title: "Loaded fries & sides", subtitle: "Fries, but make it a personality.",
    itemSlugs: ["cheesy-af-fries", "garlic-parm-fries", "buffalo-wings", "nug-life"], limit: 4,
  },
  {
    type: "why_choose_us", enabled: true, title: "Not your average burger joint",
    items: [
      { icon: "flame", title: "Smashed, not squished", description: "Fresh beef smashed thin on a screaming-hot flat-top for those crispy, lacy edges." },
      { icon: "clock", title: "Open when you're hungry", description: "Till 3 am on weeknights, 4 am on weekends. We don't judge your schedule." },
      { icon: "heart", title: "Sauce is a love language", description: "Our Bun Sauce recipe stays secret. Your extra pot doesn't have to." },
      { icon: "award", title: "100% halal, 0% boring", description: "Halal beef and chicken, potato buns toasted in butter, everything made to order." },
    ],
  },
  {
    type: "menu_preview", enabled: true, title: "Sip happens", subtitle: "Thick shakes, fresh lemonades and mocktails.",
    itemSlugs: ["unhinged-freakshake", "cookie-crumble-shake", "mint-condition-lemonade", "red-flag-mocktail"], limit: 4,
  },
  {
    type: "gallery", enabled: true, title: "#BunIntended", subtitle: "Tag us on Instagram and TikTok. The best ones end up here.",
    images: [
      { url: gal("hands-on"), alt: "A guest holding a stacked burger with both hands" },
      { url: gal("the-spot"), alt: "The Clifton spot on a busy night" },
      { url: gal("slider-squad"), alt: "Three burgers lined up for the squad" },
      { url: gal("wing-night"), alt: "Wings with dip on wing night" },
      { url: gal("the-og"), alt: "The OG under the lights" },
      { url: gal("after-dark"), alt: "Karachi after dark, on the way to a 2 am burger" },
    ],
    columns: 3,
  },
  {
    type: "featured_items", enabled: true, title: "Combos & deals", subtitle: "Solo, duo or the whole group chat. More food, less money.",
    itemSlugs: ["broke-student-combo", "situationship-combo", "group-chat-box", "3am-thoughts-combo"],
    limit: 4, layout: "grid", cta: { label: "All deals", href: `${BASE}/menu`, style: "outline" },
  },
  { type: "reviews", enabled: true, title: "The comments section", subtitle: "Unfiltered reviews from real orders.", limit: 6, layout: "grid", showCta: true },
  {
    type: "cta", enabled: true, title: "Hungry?", subtitle: "You know what to do.",
    tone: "image", image: { url: `${IMG}/cover.jpg`, alt: "Burger and fries from Bun Intended" },
    cta: { label: "Order Now", href: `${BASE}/menu`, style: "primary" },
  },
];

export const ABOUT_SECTIONS = [
  {
    type: "hero", enabled: true, eyebrow: "Our story", title: "One flat-top. One very long queue.",
    subtitle: "How a festival stall became Karachi's late-night burger habit.",
    image: { url: `${IMG}/about.jpg`, alt: "Friends sharing burgers" }, height: "sm", alignment: "center",
  },
  {
    type: "rich_text", enabled: true, title: "How it started",
    body: "In 2022 three friends rented a flat-top at a Clifton food festival with one recipe and a sauce they refused to explain. By Saturday night the queue went round the block. By Sunday we'd run out of buns.\n\nNow there are two spots, open till 3 am, but the rules haven't changed: fresh beef smashed to order, chicken brined overnight, buns toasted in butter and Bun Sauce on everything.",
    width: "narrow",
  },
  {
    type: "why_choose_us", enabled: true, title: "The rules",
    items: [
      { icon: "flame", title: "Smash it fresh", description: "Beef is ground daily and never frozen." },
      { icon: "award", title: "Halal, always", description: "Every patty and every piece of chicken." },
      { icon: "users", title: "Feed the squad", description: "Combos built for groups, deals built for students." },
    ],
  },
  { type: "cta", enabled: true, title: "Enough reading. Go eat.", tone: "primary", cta: { label: "Order Now", href: `${BASE}/menu`, style: "primary" } },
];

export const CONTACT_SECTIONS = [
  { type: "hero", enabled: true, eyebrow: "Contact", title: "Slide into our DMs", subtitle: "Orders, events, collabs or complaints. We read everything.", height: "sm", alignment: "center" },
  { type: "contact", enabled: true, title: "Get in touch", showForm: true },
  { type: "locations", enabled: true, title: "Our spots", showMap: true },
  { type: "cta", enabled: true, title: "Hungry?", subtitle: "You know what to do.", tone: "primary", cta: { label: "Order Now", href: `${BASE}/menu`, style: "primary" } },
];

/**
 * Functional pages (menu, reservation, reviews, locations) are website pages too: `page_content` marks where the
 * built-in body sits and overrides its heading. Reservations are off, so that page only carries its marker.
 */
export const MENU_SECTIONS = [
  { type: "page_content", enabled: true, title: "The menu", subtitle: "Smash burgers, crispy chicken, loaded fries and shakes. Everything made to order." },
  {
    type: "cta", enabled: true, title: "Can't decide?", subtitle: "Build your own burger, exactly how you want it.",
    tone: "primary", cta: { label: "Start building", href: `${BASE}/menu/build-your-own-burger`, style: "primary" },
  },
];

export const RESERVATION_SECTIONS = [
  { type: "page_content", enabled: true, title: "Walk-ins only", subtitle: "No bookings needed. Just show up hungry." },
];

export const REVIEWS_SECTIONS = [
  { type: "page_content", enabled: true, title: "The comments section", subtitle: "Unfiltered reviews from real orders." },
  { type: "cta", enabled: true, title: "Convinced yet?", tone: "primary", cta: { label: "Order Now", href: `${BASE}/menu`, style: "primary" } },
];

export const LOCATIONS_SECTIONS = [
  { type: "page_content", enabled: true, title: "Our spots", subtitle: "Clifton and DHA Bukhari. Open till 3 am, 4 am on weekends." },
  { type: "cta", enabled: true, title: "Too far?", subtitle: "We deliver across Clifton, DHA and central Karachi.", tone: "neutral", cta: { label: "Order delivery", href: `${BASE}/menu`, style: "primary" } },
];

/** [public url, file name, purpose, width, height] for the media library table. */
export const MEDIA: [string, string, string, number, number][] = [
  [`${IMG}/logo.svg`, "bun-intended-logo.svg", "logo", 320, 96],
  [`${IMG}/cover.jpg`, "bun-intended-cover.jpg", "cover", 1920, 1080],
  [`${IMG}/hero.jpg`, "bun-intended-hero.jpg", "hero", 1920, 1080],
  [`${IMG}/about.jpg`, "bun-intended-about.jpg", "website", 1920, 1080],
  ...["hands-on", "the-spot", "after-dark", "the-og", "wing-night", "slider-squad"].map(
    (name): [string, string, string, number, number] => [gal(name), `bun-intended-${name}.jpg`, "gallery", 1600, 1067],
  ),
];
