/**
 * Zaytoun — Levantine Kitchen. Complete demo tenant, inserted through the real schema by ./seed.ts.
 * Images live in ../images and are copied to /public/images/zaytoun by the seed (Next only serves /public).
 */

/** Deterministic, valid v4-shaped uuids: group = kind of row, n = ordinal. */
const uid = (group: number, n: number): string =>
  `7a17${group.toString(16).padStart(4, "0")}-aaaa-4aaa-8aaa-${n.toString().padStart(12, "0")}`;

export const IDS = {
  restaurant: uid(1, 1),
  locationF7: uid(2, 1),
  locationGreens: uid(2, 2),
  website: uid(3, 1),
  pageHome: uid(4, 1),
  pageAbout: uid(4, 2),
  pageContact: uid(4, 3),
  pageMenu: uid(4, 4),
  pageReservation: uid(4, 5),
  pageReviews: uid(4, 6),
  pageLocations: uid(4, 7),
  zoneF7: uid(5, 1),
  zoneCentral: uid(5, 2),
  zoneDiplomatic: uid(5, 3),
  zoneGreens: uid(5, 4),
  zoneBahria: uid(5, 5),
  couponWelcome: uid(6, 1),
  couponFlat: uid(6, 2),
  couponFreeDelivery: uid(6, 3),
  couponExpired: uid(6, 4),
  memberOwner: uid(7, 1),
  memberAdmin: uid(7, 2),
  memberManager: uid(7, 3),
  memberChef: uid(7, 4),
  userOwner: uid(8, 1),
  userAdmin: uid(8, 2),
  userManager: uid(8, 3),
  userChef: uid(8, 4),
} as const;

export const SLUG = "zaytoun";
const BASE = `/r/${SLUG}`;
const IMG = `/images/${SLUG}`;

export const RESTAURANT = {
  name: "Zaytoun",
  slug: SLUG,
  legalName: "Zaytoun Hospitality (Pvt) Ltd",
  tagline: "Levantine Kitchen",
  shortDescription: "Charcoal-grilled meats, slow-cooked rice plates and mezze made for sharing — Levantine cooking in Islamabad.",
  description:
    "Zaytoun is a Levantine kitchen built around the charcoal grill and the shared table. Lamb is marinated overnight, bread comes off the taboon in minutes, and every mezze is made by hand each morning with olive oil pressed in the hills above Beirut. Two dining rooms in Islamabad, and a delivery kitchen that keeps the fire going after dark.",
  cuisines: ["Levantine", "Middle Eastern", "Grill", "Mezze"],
  phone: "+92 51 2612 401",
  whatsapp: "+92 333 5120 401",
  email: "hello@zaytoun.pk",
  websiteUrl: "https://zaytoun.pk",
  currency: "PKR",
  currencySymbol: "Rs",
  timezone: "Asia/Karachi",
  social: {
    instagram: "https://instagram.com/zaytoun.pk",
    facebook: "https://facebook.com/zaytoun.pk",
    tiktok: "https://tiktok.com/@zaytoun.pk",
  },
  logo: `${IMG}/logo.svg`,
  cover: `${IMG}/cover.jpg`,
};

export const SETTINGS = {
  tax: { enabled: true, rate: 16, included: false, applyOnDeliveryFee: false, label: "Sales tax" },
  serviceFee: { enabled: true, rate: 5, orderTypes: ["dine_in"] },
  ordering: {
    onlineOrderingEnabled: true,
    minimumOrderAmount: 900,
    maxAdvanceDays: 5,
    allowScheduledOrders: true,
    preparationTimeMinutes: 25,
    packagingCharge: 0,
    requirePhoneVerification: false,
  },
  payments: {
    enabledMethods: ["cash_on_delivery", "cash", "card_online", "card_terminal"],
    onlineProvider: "none",
    payAtStoreEnabled: true,
  },
  reservations: {
    enabled: true,
    slotMinutes: 30,
    minGuests: 1,
    maxGuests: 14,
    autoConfirm: true,
    maxAdvanceDays: 45,
    defaultDurationMinutes: 105,
    tables: [
      { name: "T1", seats: 2 },
      { name: "T2", seats: 2 },
      { name: "T3", seats: 4 },
      { name: "T4", seats: 4 },
      { name: "T5", seats: 6 },
      { name: "T6", seats: 8 },
      { name: "Courtyard 1", seats: 4 },
      { name: "Courtyard 2", seats: 6 },
      { name: "Majlis", seats: 12 },
    ],
  },
  delivery: { enabled: true, defaultEtaMinutes: 45, freeDeliveryOver: null, trackingEnabled: true },
  loyalty: { enabled: false, pointsPerCurrencyUnit: 1, redeemRate: 0.01 },
  receipt: { footerNote: "Shukran for dining with Zaytoun. Follow @zaytoun.pk", showTaxNumber: false },
};

export const FEATURES = {
  onlineOrdering: true,
  delivery: true,
  pickup: true,
  dineIn: true,
  reservations: true,
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

const OPEN_LATE = [{ open: "12:00", close: "23:30" }];
export const HOURS_F7 = {
  mon: OPEN_LATE, tue: OPEN_LATE, wed: OPEN_LATE, thu: OPEN_LATE,
  fri: [{ open: "13:00", close: "00:30" }],
  sat: [{ open: "12:00", close: "00:30" }],
  sun: [{ open: "12:00", close: "23:30" }],
};
export const HOURS_GREENS = {
  mon: [{ open: "13:00", close: "23:00" }], tue: [{ open: "13:00", close: "23:00" }],
  wed: [{ open: "13:00", close: "23:00" }], thu: [{ open: "13:00", close: "23:00" }],
  fri: [{ open: "13:00", close: "00:00" }],
  sat: [{ open: "12:00", close: "00:00" }],
  sun: [{ open: "12:00", close: "23:00" }],
};

export const LOCATIONS = [
  {
    id: IDS.locationF7, name: "F-7 Markaz", slug: "f-7-markaz", primary: true,
    line1: "Shop 12, Jinnah Super Market", area: "F-7", city: "Islamabad", state: "Islamabad Capital Territory",
    postalCode: "44000", phone: "+92 51 2612 401", latitude: 33.7215, longitude: 73.0563, hours: HOURS_F7,
    settings: { diningRooms: 2, courtyard: true, parking: true },
  },
  {
    id: IDS.locationGreens, name: "Gulberg Greens", slug: "gulberg-greens", primary: false,
    line1: "Plaza 4, Gulberg Greens Boulevard", area: "Gulberg Greens", city: "Islamabad", state: "Islamabad Capital Territory",
    postalCode: "44080", phone: "+92 51 2612 402", latitude: 33.6069, longitude: 73.1728, hours: HOURS_GREENS,
    settings: { diningRooms: 1, courtyard: true, parking: true },
  },
];

export const THEME = {
  name: "Olive & Saffron",
  primary: "#2F5D46",
  primaryForeground: "#FFFFFF",
  secondary: "#1B2B24",
  accent: "#C8963E",
  background: "#FBF7EF",
  surface: "#FFFFFF",
  foreground: "#1C1A16",
  muted: "#6B6A62",
  border: "#E6DFCF",
  font: "Playfair Display",
  bodyFont: "Inter",
  radius: "lg",
  dark: false,
};

export const NAV = [
  { label: "Home", href: BASE, enabled: true },
  { label: "Menu", href: `${BASE}/menu`, enabled: true },
  { label: "Our Story", href: `${BASE}/about`, enabled: true },
  { label: "Reservations", href: `${BASE}/reservation`, enabled: true },
  { label: "Reviews", href: `${BASE}/reviews`, enabled: true },
  { label: "Locations", href: `${BASE}/locations`, enabled: true },
];

export const TEAM = [
  { id: IDS.userOwner, member: IDS.memberOwner, email: "owner@zaytoun.pk", name: "Karim Haddad", role: "owner", password: "Zaytoun#1", phone: "+92 300 5551001" },
  { id: IDS.userAdmin, member: IDS.memberAdmin, email: "admin@zaytoun.pk", name: "Mariam Saleh", role: "admin", password: "Zaytoun#2", phone: "+92 300 5551002" },
  { id: IDS.userManager, member: IDS.memberManager, email: "manager@zaytoun.pk", name: "Hira Zafar", role: "manager", password: "Zaytoun#3", phone: "+92 300 5551003" },
  { id: IDS.userChef, member: IDS.memberChef, email: "chef@zaytoun.pk", name: "Tariq Nabulsi", role: "staff", password: "Zaytoun#4", phone: "+92 300 5551004" },
];

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------
export interface SeedCategory { slug: string; name: string; description: string; image: string; icon: string; featured?: boolean }

export const CATEGORIES: SeedCategory[] = [
  { slug: "mezze", name: "Mezze & Small Plates", description: "Hot and cold plates for the middle of the table.", image: `${IMG}/menu/mezze-platter.jpg`, icon: "utensils", featured: true },
  { slug: "soups-salads", name: "Soups & Salads", description: "Bright, herby and dressed to order.", image: `${IMG}/menu/fattoush.jpg`, icon: "salad" },
  { slug: "grill", name: "Charcoal Grill", description: "Marinated overnight, cooked over lump charcoal.", image: `${IMG}/menu/mixed-grill.jpg`, icon: "flame", featured: true },
  { slug: "wraps", name: "Shawarma & Wraps", description: "Spit-roasted, sliced thin, wrapped hot.", image: `${IMG}/menu/shawarma-wrap.jpg`, icon: "sandwich" },
  { slug: "plates", name: "Signature Plates", description: "Slow-cooked rice and stews from the family kitchen.", image: `${IMG}/menu/lamb-mansaf.jpg`, icon: "chef-hat", featured: true },
  { slug: "desserts", name: "Sweets", description: "Syrup, pistachio, rose and cream.", image: `${IMG}/menu/baklava.jpg`, icon: "cake", featured: true },
  { slug: "drinks", name: "Drinks & Coolers", description: "Fresh, sparkling and freshly brewed.", image: `${IMG}/menu/limonana.jpg`, icon: "cup-soda" },
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

const m = (file: string) => `${IMG}/menu/${file}.jpg`;

const SIDES: SeedAddonGroup = {
  name: "Choose your side", isRequired: true, minSelect: 1, maxSelect: 1,
  addons: [
    { name: "Saffron rice", price: "0.00", isDefault: true },
    { name: "Garlic potatoes", price: "0.00" },
    { name: "Fattoush salad", price: "200.00" },
    { name: "Fries", price: "0.00" },
  ],
};
const DIPS: SeedAddonGroup = {
  name: "Dips", maxSelect: 3,
  addons: [
    { name: "Toum (garlic)", price: "120.00" },
    { name: "Muhammara", price: "180.00" },
    { name: "Tahini", price: "100.00" },
    { name: "Chilli & lemon", price: "80.00" },
  ],
};
const BREAD: SeedAddonGroup = {
  name: "Extra bread", maxSelect: 2,
  addons: [{ name: "Warm flatbread", price: "90.00", maxQuantity: 4 }, { name: "Za'atar flatbread", price: "140.00", maxQuantity: 4 }],
};
const WRAP_EXTRAS: SeedAddonGroup = {
  name: "Extras", maxSelect: 3,
  addons: [
    { name: "Extra chicken", price: "260.00" },
    { name: "Fries inside", price: "120.00" },
    { name: "Extra toum", price: "60.00" },
    { name: "Pickled chillies", price: "40.00" },
  ],
};
const HEAT: SeedAddonGroup = {
  name: "Heat level", isRequired: true, minSelect: 1, maxSelect: 1,
  addons: [{ name: "Mild", price: "0.00", isDefault: true }, { name: "Medium", price: "0.00" }, { name: "Hot", price: "0.00" }],
};

export const ITEMS: SeedItem[] = [
  // ── Mezze ────────────────────────────────────────────────────────────────
  {
    name: "Mezze Sharing Platter", slug: "mezze-sharing-platter", category: "mezze", image: m("mezze-platter"),
    price: "2450.00", featured: true, prepTime: 18, calories: 1100,
    shortDescription: "Falafel, grilled chicken, tabbouleh, flatbread",
    description: "Our best-seller: crisp herb falafel, charcoal chicken, tabbouleh, pickled turnip and warm flatbread with house dips — built for the middle of the table.",
    dietaryTags: ["halal"], allergens: ["gluten", "sesame"],
    variants: [{ name: "For 2", price: "2450.00", isDefault: true }, { name: "For 4", price: "4450.00" }],
    addonGroups: [DIPS, BREAD],
  },
  {
    name: "Grilled Halloumi", slug: "grilled-halloumi", category: "mezze", image: m("grilled-halloumi"),
    price: "1150.00", prepTime: 12,
    description: "Halloumi baked until golden with sweet peppers, tomato, basil and thyme honey. Served in the pan with warm bread.",
    dietaryTags: ["vegetarian", "halal"], allergens: ["dairy", "gluten"],
  },
  {
    name: "Taboon Bread & Labneh", slug: "taboon-bread-labneh", category: "mezze", image: m("taboon-bread"),
    price: "890.00", prepTime: 8,
    description: "Bread baked to order in the taboon, served hot with strained-yoghurt labneh, olive oil and za'atar.",
    dietaryTags: ["vegetarian", "halal"], allergens: ["dairy", "gluten"],
  },
  {
    name: "Lamb Sambousek", slug: "lamb-sambousek", category: "mezze", image: m("sambousek"),
    price: "990.00", prepTime: 14, spiceLevel: 1,
    description: "Crisp half-moon pastries filled with spiced lamb, pine nuts and sumac onion. Served with cucumber yoghurt.",
    dietaryTags: ["halal"], allergens: ["gluten", "dairy", "nuts"],
    variants: [{ name: "4 pieces", price: "990.00", isDefault: true }, { name: "8 pieces", price: "1790.00" }],
  },
  {
    name: "Pomegranate Glazed Wings", slug: "pomegranate-glazed-wings", category: "mezze", image: m("pomegranate-wings"),
    price: "1290.00", prepTime: 18, spiceLevel: 1,
    description: "Jawaneh: wings glazed in pomegranate molasses and garlic, finished on the grill with coriander and lime.",
    dietaryTags: ["halal"],
    variants: [{ name: "6 pieces", price: "1290.00", isDefault: true }, { name: "12 pieces", price: "2390.00" }],
    addonGroups: [DIPS],
  },

  // ── Soups & Salads ───────────────────────────────────────────────────────
  {
    name: "Shorbat Adas", slug: "shorbat-adas", category: "soups-salads", image: m("lentil-soup"),
    price: "690.00", prepTime: 8,
    description: "Red lentil soup with cumin and a squeeze of lemon, finished with crisp pita and olive oil.",
    dietaryTags: ["vegan", "halal"], allergens: ["gluten"],
  },
  {
    name: "Roasted Pumpkin & Sumac Soup", slug: "pumpkin-sumac-soup", category: "soups-salads", image: m("pumpkin-sumac-soup"),
    price: "750.00", prepTime: 8, calories: 210,
    description: "Slow-roasted pumpkin blended with tahini, topped with toasted pumpkin seeds and a pinch of sumac.",
    dietaryTags: ["vegetarian", "halal"], allergens: ["sesame"],
  },
  {
    name: "Garden Fattoush", slug: "garden-fattoush", category: "soups-salads", image: m("fattoush"),
    price: "950.00", prepTime: 8,
    description: "Crisp cos, cucumber, radish, tomato and mint under crunchy pita, dressed in pomegranate and sumac.",
    dietaryTags: ["vegan", "halal"], allergens: ["gluten"],
  },
  {
    name: "Tabbouleh Grain Bowl", slug: "tabbouleh-grain-bowl", category: "soups-salads", image: m("tabbouleh-bowl"),
    price: "1190.00", prepTime: 10, calories: 480,
    description: "Bulgur tabbouleh with roasted vegetables, green beans, cherry tomatoes and a lemon-tahini drizzle.",
    dietaryTags: ["vegan", "halal"], allergens: ["gluten", "sesame"],
  },
  {
    name: "Roasted Chickpea Bowl", slug: "roasted-chickpea-bowl", category: "soups-salads", image: m("chickpea-bowl"),
    price: "1290.00", prepTime: 10, calories: 520,
    description: "Spiced roasted chickpeas, sweet potato, avocado, beetroot and greens with garlicky tahini.",
    dietaryTags: ["vegan", "halal"], allergens: ["sesame"],
  },

  // ── Charcoal Grill ───────────────────────────────────────────────────────
  {
    name: "Zaytoun Mixed Grill", slug: "zaytoun-mixed-grill", category: "grill", image: m("mixed-grill"),
    price: "3950.00", featured: true, prepTime: 30, calories: 1450,
    shortDescription: "Kofta, shish taouk, lamb cubes, wings",
    description: "Lamb kofta, shish taouk, marinated lamb cubes and wings with grilled tomato and pepper, saffron rice, toum and hot flatbread.",
    dietaryTags: ["halal", "gluten-free"], allergens: ["dairy"],
    variants: [{ name: "For 2", price: "3950.00", isDefault: true }, { name: "For 4", price: "7200.00" }],
    addonGroups: [DIPS, BREAD],
  },
  {
    name: "Chicken Shish Taouk", slug: "chicken-shish-taouk", category: "grill", image: m("shish-taouk"),
    price: "1890.00", prepTime: 22, calories: 780,
    description: "Yoghurt, lemon and paprika-marinated chicken skewers over charcoal, with toum and your choice of side.",
    dietaryTags: ["halal"], allergens: ["dairy"],
    addonGroups: [SIDES, DIPS],
  },
  {
    name: "Lamb Kofta Skewers", slug: "lamb-kofta-skewers", category: "grill", image: m("lamb-kofta"),
    price: "2190.00", prepTime: 24, spiceLevel: 1, calories: 860,
    description: "Hand-minced lamb with parsley, onion and seven-spice, grilled to order. Served with grilled tomato, fries and tahini.",
    dietaryTags: ["halal"], allergens: ["sesame"],
    addonGroups: [SIDES, HEAT],
  },
  {
    name: "Charcoal Lamb Ribs", slug: "charcoal-lamb-ribs", category: "grill", image: m("lamb-ribs"),
    price: "3290.00", prepTime: 35, calories: 1180,
    description: "Slow-cooked for six hours, then charred over coals with a cumin and pomegranate rub. Falls off the bone.",
    dietaryTags: ["halal", "gluten-free"],
    addonGroups: [SIDES, DIPS],
  },
  {
    name: "Lemon Herb Chicken", slug: "lemon-herb-chicken", category: "grill", image: m("lemon-chicken"),
    price: "1990.00", prepTime: 22, calories: 640,
    description: "Grilled chicken breast with lemon, rosemary and garlic, alongside charred seasonal vegetables.",
    dietaryTags: ["halal", "gluten-free"],
    addonGroups: [SIDES],
  },
  {
    name: "Lahm Mashwi — Lamb Sirloin", slug: "lahm-mashwi", category: "grill", image: m("lamb-sirloin"),
    price: "3650.00", prepTime: 28, calories: 900,
    description: "Thick-cut lamb sirloin, seasoned simply with salt, garlic and rosemary, rested and sliced. Served with grilled onions.",
    dietaryTags: ["halal", "gluten-free"],
    variants: [{ name: "200 g", price: "3650.00", isDefault: true }, { name: "300 g", price: "4990.00" }],
    addonGroups: [SIDES],
  },
  {
    name: "Charcoal Roast Chicken", slug: "charcoal-roast-chicken", category: "grill", image: m("roast-chicken"),
    price: "1690.00", prepTime: 30, calories: 720,
    description: "Farrouj mashwi: free-range chicken brined overnight, spatchcocked and roasted over coals until the skin crackles.",
    dietaryTags: ["halal", "gluten-free"],
    variants: [{ name: "Half", price: "1690.00", isDefault: true }, { name: "Whole", price: "2890.00" }],
    addonGroups: [SIDES, DIPS],
  },

  // ── Shawarma & Wraps ─────────────────────────────────────────────────────
  {
    name: "Chicken Shawarma Wrap", slug: "chicken-shawarma-wrap", category: "wraps", image: m("shawarma-wrap"),
    price: "990.00", featured: true, prepTime: 10, calories: 620,
    description: "Thinly sliced spit-roasted chicken, pickles, cabbage and toum in a toasted saj wrap.",
    dietaryTags: ["halal"], allergens: ["gluten"],
    addonGroups: [WRAP_EXTRAS],
  },
  {
    name: "Chicken Shawarma Plate", slug: "chicken-shawarma-plate", category: "wraps", image: m("shawarma-plate"),
    price: "1490.00", prepTime: 12, calories: 830,
    description: "Shawarma chicken over crisp fries with onion, pickles, parsley, toum and hot sauce, with flatbread on the side.",
    dietaryTags: ["halal"], allergens: ["gluten"],
    addonGroups: [DIPS],
  },

  // ── Signature Plates ─────────────────────────────────────────────────────
  {
    name: "Lamb Shank Mansaf", slug: "lamb-shank-mansaf", category: "plates", image: m("lamb-mansaf"),
    price: "2690.00", featured: true, prepTime: 25, calories: 1050,
    shortDescription: "Braised lamb shank over spiced rice",
    description: "A lamb shank braised for five hours, laid over saffron-spiced rice with toasted almonds and jameed sauce on the side.",
    dietaryTags: ["halal"], allergens: ["dairy", "nuts"],
  },
  {
    name: "Chicken Maqluba", slug: "chicken-maqluba", category: "plates", image: m("chicken-maqluba"),
    price: "1790.00", prepTime: 20, calories: 830,
    description: "\"Upside-down\" rice with chicken, aubergine and cauliflower, turned out at the table and topped with crisp onions.",
    dietaryTags: ["halal"],
  },
  {
    name: "Lamb Yakhni", slug: "lamb-yakhni", category: "plates", image: m("lamb-yakhni"),
    price: "2390.00", prepTime: 20, calories: 760,
    description: "Lamb slow-cooked with carrot, coriander and warm spices until tender; served with buttered rice.",
    dietaryTags: ["halal", "gluten-free"], spiceLevel: 1,
  },
  {
    name: "Samke Harra — Spiced Salmon", slug: "samke-harra", category: "plates", image: m("samke-harra"),
    price: "2590.00", prepTime: 22, spiceLevel: 2, calories: 680,
    description: "Pan-seared salmon in a chilli, coriander and tahini sauce with lemon, served on herbed rice.",
    dietaryTags: ["halal", "gluten-free"], allergens: ["fish", "sesame"],
  },
  {
    name: "Freekeh & Almond Pilaf", slug: "freekeh-almond-pilaf", category: "plates", image: m("freekeh-pilaf"),
    price: "1390.00", prepTime: 18, calories: 590,
    description: "Smoky green wheat cooked with caramelised onion, toasted almonds and warm spices, finished with lemon.",
    dietaryTags: ["vegan", "halal"], allergens: ["gluten", "nuts"],
  },

  // ── Sweets ───────────────────────────────────────────────────────────────
  {
    name: "Assorted Baklava", slug: "assorted-baklava", category: "desserts", image: m("baklava"),
    price: "990.00", featured: true, prepTime: 5,
    description: "Pistachio, walnut and cashew baklava, baked each morning with orange-blossom syrup.",
    dietaryTags: ["vegetarian", "halal"], allergens: ["gluten", "nuts", "dairy"],
    variants: [{ name: "6 pieces", price: "990.00", isDefault: true }, { name: "12 pieces", price: "1790.00" }],
  },
  {
    name: "Muhallebi", slug: "muhallebi", category: "desserts", image: m("muhallebi"),
    price: "690.00", prepTime: 5,
    description: "Silky rose-scented milk pudding, layered with fresh berries and crushed pistachio.",
    dietaryTags: ["vegetarian", "halal", "gluten-free"], allergens: ["dairy", "nuts"],
  },
  {
    name: "Tahini Chocolate Cake", slug: "tahini-chocolate-cake", category: "desserts", image: m("tahini-chocolate-cake"),
    price: "890.00", prepTime: 5,
    description: "Dark chocolate ganache cake with a tahini caramel centre and sea salt.",
    dietaryTags: ["vegetarian"], allergens: ["gluten", "dairy", "sesame", "eggs"],
  },
  {
    name: "Rose & Raspberry Layer Cake", slug: "rose-raspberry-cake", category: "desserts", image: m("rose-raspberry-cake"),
    price: "950.00", prepTime: 5,
    description: "Vanilla sponge with rose cream, raspberry compote and fresh berries.",
    dietaryTags: ["vegetarian"], allergens: ["gluten", "dairy", "eggs"],
  },
  {
    name: "Ashta Ice Cream", slug: "ashta-ice-cream", category: "desserts", image: m("ashta-ice-cream"),
    price: "790.00", prepTime: 5,
    description: "Clotted-cream ice cream with a date-caramel drizzle, crushed pistachio and a crisp wafer.",
    dietaryTags: ["vegetarian", "halal"], allergens: ["dairy", "nuts"],
  },

  // ── Drinks ───────────────────────────────────────────────────────────────
  {
    name: "Limonana", slug: "limonana", category: "drinks", image: m("limonana"),
    price: "550.00", featured: true, prepTime: 4,
    description: "Fresh-pressed lemon blended with mint over crushed ice. The house drink.",
    dietaryTags: ["vegan", "halal"],
    variants: [{ name: "Regular", price: "550.00", isDefault: true }, { name: "1 litre jug", price: "1650.00" }],
  },
  {
    name: "Pomegranate Rose Cooler", slug: "pomegranate-rose-cooler", category: "drinks", image: m("pomegranate-cooler"),
    price: "590.00", prepTime: 4,
    description: "Pomegranate, strawberry, lime and rose water, shaken over ice.",
    dietaryTags: ["vegan", "halal"],
  },
  {
    name: "Fresh Orange Juice", slug: "fresh-orange-juice", category: "drinks", image: m("orange-juice"),
    price: "550.00", prepTime: 4,
    description: "Squeezed to order, nothing added.",
    dietaryTags: ["vegan", "halal", "gluten-free"],
  },
  {
    name: "Karak Chai", slug: "karak-chai", category: "drinks", image: m("karak-chai"),
    price: "390.00", prepTime: 5,
    description: "Strong tea simmered with cardamom and evaporated milk.",
    dietaryTags: ["vegetarian", "halal"], allergens: ["dairy"],
  },
  {
    name: "Iced Spiced Latte", slug: "iced-spiced-latte", category: "drinks", image: m("iced-spiced-latte"),
    price: "590.00", prepTime: 4,
    description: "Espresso, cold milk and a cardamom-cinnamon syrup over ice.",
    dietaryTags: ["vegetarian"], allergens: ["dairy"],
  },
  {
    name: "Cardamom Coffee", slug: "cardamom-coffee", category: "drinks", image: m("cardamom-coffee"),
    price: "450.00", prepTime: 6,
    description: "Fine-ground coffee brewed slowly with cardamom, served the traditional way.",
    dietaryTags: ["vegan", "halal"],
    variants: [{ name: "Cup", price: "450.00", isDefault: true }, { name: "Pot for two", price: "820.00" }],
  },
];

export const ZONES = [
  { id: IDS.zoneF7, locationId: IDS.locationF7, name: "F-6, F-7 & F-8", description: "Delivered hot from our F-7 Markaz kitchen.",
    areas: ["F-6", "F-7", "F-8", "Jinnah Super", "Super Market"], postalCodes: ["44000", "44040"], fee: "150.00", minOrder: "1200.00", freeOver: "5000.00", etaMin: 25, etaMax: 40 },
  { id: IDS.zoneCentral, locationId: IDS.locationF7, name: "G-6 to G-11 & Blue Area", areas: ["G-6", "G-7", "G-8", "G-9", "G-10", "G-11", "Blue Area"], postalCodes: ["44000", "44090"], fee: "200.00", minOrder: "1500.00", freeOver: "6000.00", etaMin: 30, etaMax: 50 },
  { id: IDS.zoneDiplomatic, locationId: IDS.locationF7, name: "Diplomatic Enclave & E-sectors", areas: ["Diplomatic Enclave", "E-7", "E-8", "E-11", "Margalla Road"], postalCodes: ["44000", "44010"], fee: "250.00", minOrder: "1800.00", freeOver: null, etaMin: 35, etaMax: 55 },
  { id: IDS.zoneGreens, locationId: IDS.locationGreens, name: "Gulberg & Gulberg Greens", areas: ["Gulberg Greens", "Gulberg Residencia", "Islamabad Expressway"], postalCodes: ["44080"], fee: "150.00", minOrder: "1200.00", freeOver: "5000.00", etaMin: 25, etaMax: 40 },
  { id: IDS.zoneBahria, locationId: IDS.locationGreens, name: "Bahria Town & DHA", areas: ["Bahria Town", "DHA Phase 2", "DHA Phase 5", "Park Road"], postalCodes: ["46220", "44000"], fee: "250.00", minOrder: "2000.00", freeOver: null, etaMin: 40, etaMax: 65 },
];

export const COUPONS = [
  { id: IDS.couponWelcome, code: "WELCOME15", description: "15% off your first order", type: "percentage", value: "15.00", minOrder: "1500.00", maxDiscount: "600.00", appliesTo: "order", usageLimit: 500, perCustomer: 1, startsAt: -30, endsAt: 150, active: true },
  { id: IDS.couponFlat, code: "SHARE500", description: "Rs 500 off orders above Rs 4,500", type: "fixed", value: "500.00", minOrder: "4500.00", maxDiscount: null, appliesTo: "order", usageLimit: null, perCustomer: 2, startsAt: -60, endsAt: 90, active: true },
  { id: IDS.couponFreeDelivery, code: "FREESHIP", description: "Free delivery on orders above Rs 2,500", type: "fixed", value: "250.00", minOrder: "2500.00", maxDiscount: null, appliesTo: "delivery_fee", usageLimit: 300, perCustomer: null, startsAt: -10, endsAt: 60, active: true },
  { id: IDS.couponExpired, code: "IFTAR20", description: "20% Iftar set-menu offer (expired)", type: "percentage", value: "20.00", minOrder: "2000.00", maxDiscount: "800.00", appliesTo: "order", usageLimit: 200, perCustomer: 1, startsAt: -400, endsAt: -20, active: true },
];

// ---------------------------------------------------------------------------
// People, reviews, reservations, orders
// ---------------------------------------------------------------------------
const c = (n: number) => uid(9, n);
export const CUSTOMERS = [
  { id: c(1), name: "Areeba Siddiqui", phone: "+92 300 2345671", email: "areeba.siddiqui@example.com", account: false, address: { label: "Home", line1: "House 14, Street 32", area: "F-7/2", city: "Islamabad" } },
  { id: c(2), name: "Faisal Mahmood", phone: "+92 321 8765432", email: "faisal.mahmood@example.com", account: false, address: { label: "Office", line1: "Office 5, Ufone Tower", area: "Blue Area", city: "Islamabad" } },
  { id: c(3), name: "Noor Ahmed", phone: "+92 333 5566778", email: "noor.ahmed@example.com", account: true, address: { label: "Home", line1: "House 220, Street 9", area: "G-6/3", city: "Islamabad" } },
  { id: c(4), name: "Omar Qureshi", phone: "+92 345 6677889", email: "omar.qureshi@example.com", account: false, address: { label: "Home", line1: "Plot 41, Sector A", area: "Gulberg Greens", city: "Islamabad" } },
  { id: c(5), name: "Laila Hussain", phone: "+92 301 3344556", email: "laila.hussain@example.com", account: false, address: { label: "Home", line1: "House 8, Street 4", area: "E-7", city: "Islamabad" } },
  { id: c(6), name: "Saad Bukhari", phone: "+92 302 7788990", email: "saad.bukhari@example.com", account: false, address: { label: "Home", line1: "Villa 22, Phase 2", area: "Bahria Town", city: "Islamabad" } },
  { id: c(7), name: "Mehr Jamil", phone: "+92 311 9900112", email: "mehr.jamil@example.com", account: true, address: { label: "Home", line1: "Flat 3B, Grand Plaza", area: "F-8", city: "Islamabad" } },
  { id: c(8), name: "Danish Rauf", phone: "+92 336 2233445", email: "danish.rauf@example.com", account: false, address: { label: "Home", line1: "House 61, Street 15", area: "G-9/1", city: "Islamabad" } },
];
const cust = (n: number) => CUSTOMERS[n - 1]!;

export const REVIEWS = [
  { customer: 1, itemSlug: "zaytoun-mixed-grill", author: "Areeba Siddiqui", rating: 5, title: "The mixed grill is an event", comment: "Everything was cooked perfectly — the kofta is juicy, the shish taouk has that lemony char. Fed four of us with leftovers.", status: "approved", featured: true, daysAgo: 3 },
  { customer: 2, itemSlug: "lamb-shank-mansaf", author: "Faisal Mahmood", rating: 5, title: "Fall-off-the-bone lamb", comment: "Tender, deeply flavoured and the almonds on the rice are a great touch. Best mansaf I've had outside Amman.", status: "approved", featured: true, daysAgo: 5 },
  { customer: 3, itemSlug: "assorted-baklava", author: "Noor Ahmed", rating: 5, title: "Fresh, not syrupy", comment: "Crisp layers, plenty of pistachio, and not sickly sweet like most places. We order a box every week.", status: "approved", featured: true, daysAgo: 8 },
  { customer: 4, itemSlug: "chicken-shawarma-wrap", author: "Omar Qureshi", rating: 4, title: "Proper shawarma", comment: "Great garlic sauce, proper char on the chicken. I'd like a slightly bigger wrap for the price, but I'll be back.", status: "approved", featured: false, daysAgo: 11 },
  { customer: 5, itemSlug: "limonana", author: "Laila Hussain", rating: 5, title: "Best limonana in town", comment: "Tart, minty and ice-cold. The jug is perfect for sharing.", status: "approved", featured: false, daysAgo: 14 },
  { customer: 6, itemSlug: "charcoal-lamb-ribs", author: "Saad Bukhari", rating: 5, title: "Worth the wait", comment: "The ribs need thirty-five minutes but they're worth every one. Smoky, sticky and incredibly tender.", status: "approved", featured: true, daysAgo: 18 },
  { customer: null, itemSlug: "mezze-sharing-platter", author: "Hina R.", rating: 4, title: "Great for a group", comment: "Ordered the platter for six and it disappeared. Falafel was crisp, hummus dip was creamy. Service was quick.", status: "approved", featured: false, daysAgo: 22 },
  { customer: 7, itemSlug: "muhallebi", author: "Mehr Jamil", rating: 5, title: "Delicate and lovely", comment: "The rose flavour is subtle and the pistachio adds crunch. A perfect end to dinner.", status: "pending", featured: false, daysAgo: 1 },
  { customer: null, itemSlug: "fresh-orange-juice", author: "Anonymous", rating: 2, title: "Arrived late", comment: "Juice was fine but the order arrived 25 minutes past the estimate.", status: "rejected", featured: false, daysAgo: 28 },
];

export const RESERVATIONS = [
  { customer: 1, daysAhead: 1, time: "20:00", guests: 4, table: "T3", status: "confirmed", occasion: "Birthday", requests: "A candle on the baklava, please." },
  { customer: 2, daysAhead: 2, time: "19:30", guests: 2, table: "T1", status: "confirmed", occasion: null, requests: null },
  { customer: 4, daysAhead: 3, time: "21:00", guests: 8, table: "T6", status: "pending", occasion: "Family dinner", requests: "Quiet corner if possible." },
  { customer: 5, daysAhead: 5, time: "13:30", guests: 4, table: null, status: "pending", occasion: null, requests: "Courtyard seating." },
  { customer: 3, daysAhead: -3, time: "20:30", guests: 5, table: "T5", status: "completed", occasion: null, requests: null },
  { customer: 6, daysAhead: -1, time: "19:00", guests: 12, table: "Majlis", status: "no_show", occasion: "Corporate dinner", requests: null },
];

export interface SeedOrder {
  customer: number;
  location: "f7" | "greens";
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
  { customer: 1, location: "f7", orderType: "delivery", status: "pending", hoursAgo: 0.2, zoneId: IDS.zoneF7, paymentMethod: "cash_on_delivery", paymentStatus: "pending", couponCode: "WELCOME15", notes: "Please add extra toum.",
    items: [{ slug: "zaytoun-mixed-grill", quantity: 1, variant: "For 2", addons: ["Toum (garlic)", "Warm flatbread"] }, { slug: "limonana", quantity: 2, variant: "Regular" }] },
  { customer: 2, location: "f7", orderType: "delivery", status: "confirmed", hoursAgo: 0.5, zoneId: IDS.zoneCentral, paymentMethod: "cash_on_delivery", paymentStatus: "pending",
    items: [{ slug: "chicken-shawarma-wrap", quantity: 3, addons: ["Extra chicken", "Extra toum"] }, { slug: "karak-chai", quantity: 3 }] },
  { customer: 3, location: "f7", orderType: "delivery", status: "preparing", hoursAgo: 0.8, zoneId: IDS.zoneF7, paymentMethod: "cash_on_delivery", paymentStatus: "pending", couponCode: "SHARE500",
    items: [{ slug: "lamb-shank-mansaf", quantity: 2 }, { slug: "mezze-sharing-platter", quantity: 1, variant: "For 2" }, { slug: "assorted-baklava", quantity: 1, variant: "12 pieces" }] },
  { customer: 4, location: "greens", orderType: "delivery", status: "ready", hoursAgo: 1.1, zoneId: IDS.zoneGreens, paymentMethod: "card_terminal", paymentStatus: "pending",
    items: [{ slug: "charcoal-roast-chicken", quantity: 1, variant: "Whole", addons: ["Saffron rice", "Toum (garlic)"] }, { slug: "garden-fattoush", quantity: 1 }] },
  { customer: 5, location: "f7", orderType: "delivery", status: "out_for_delivery", hoursAgo: 1.4, zoneId: IDS.zoneDiplomatic, paymentMethod: "cash_on_delivery", paymentStatus: "pending", couponCode: "FREESHIP",
    items: [{ slug: "lamb-kofta-skewers", quantity: 2, addons: ["Saffron rice", "Medium"] }, { slug: "pomegranate-glazed-wings", quantity: 1, variant: "12 pieces" }] },
  { customer: 6, location: "greens", orderType: "delivery", status: "completed", hoursAgo: 26, zoneId: IDS.zoneBahria, paymentMethod: "cash_on_delivery", paymentStatus: "paid",
    items: [{ slug: "charcoal-lamb-ribs", quantity: 2, addons: ["Garlic potatoes", "Tahini"] }, { slug: "pomegranate-rose-cooler", quantity: 2 }] },
  { customer: 7, location: "f7", orderType: "pickup", status: "completed", hoursAgo: 30, paymentMethod: "card_terminal", paymentStatus: "paid",
    items: [{ slug: "chicken-shawarma-plate", quantity: 2 }, { slug: "iced-spiced-latte", quantity: 2 }] },
  { customer: 3, location: "f7", orderType: "dine_in", status: "completed", hoursAgo: 52, tableNumber: "T5", guests: 5, paymentMethod: "card_terminal", paymentStatus: "paid",
    items: [{ slug: "zaytoun-mixed-grill", quantity: 1, variant: "For 4", addons: ["Toum (garlic)"] }, { slug: "samke-harra", quantity: 1 }, { slug: "muhallebi", quantity: 3 }, { slug: "cardamom-coffee", quantity: 2, variant: "Pot for two" }] },
  { customer: 8, location: "f7", orderType: "delivery", status: "completed", hoursAgo: 75, zoneId: IDS.zoneCentral, paymentMethod: "cash_on_delivery", paymentStatus: "paid",
    items: [{ slug: "chicken-maqluba", quantity: 2 }, { slug: "shorbat-adas", quantity: 2 }] },
  { customer: 2, location: "f7", orderType: "delivery", status: "cancelled", hoursAgo: 100, zoneId: IDS.zoneCentral, paymentMethod: "cash_on_delivery", paymentStatus: "cancelled", notes: "Customer requested cancellation — changed plans.",
    items: [{ slug: "lahm-mashwi", quantity: 1, variant: "300 g", addons: ["Saffron rice"] }] },
];

export { cust };

// ---------------------------------------------------------------------------
// Website content
// ---------------------------------------------------------------------------
const gal = (file: string) => `${IMG}/gallery/${file}.jpg`;

export const WEBSITE_CONFIG = {
  announcement: {
    enabled: true,
    text: "Free delivery on orders over Rs 2,500 in F-6, F-7 and F-8 — use code FREESHIP",
    linkLabel: "Order now",
    linkHref: `${BASE}/menu`,
  },
  navigation: { items: NAV, showCart: true, sticky: true },
  footer: {
    tagline: "Charcoal, olive oil and a table full of sharing plates — Levantine cooking in Islamabad.",
    columns: [
      { title: "Explore", links: [
        { label: "Menu", href: `${BASE}/menu`, enabled: true },
        { label: "Our story", href: `${BASE}/about` },
        { label: "Contact", href: `${BASE}/contact` },
        { label: "Reservations", href: `${BASE}/reservation`, enabled: true },
        { label: "Reviews", href: `${BASE}/reviews`, enabled: true },
        { label: "Locations", href: `${BASE}/locations`, enabled: true },
      ] },
      { title: "Visit", links: [
        { label: "F-7 Markaz", href: `${BASE}/locations` },
        { label: "Gulberg Greens", href: `${BASE}/locations` },
      ] },
    ],
    legalNote: "Prices exclude sales tax, shown at checkout.",
  },
  ordering: { defaultOrderType: "delivery", allowGuestCheckout: true, showPrepTime: true, ctaLabel: "Order online" },
  contact: { email: RESTAURANT.email, showWhatsapp: true },
  social: { instagram: RESTAURANT.social.instagram, facebook: RESTAURANT.social.facebook },
};

export const HOME_SECTIONS = [
  {
    type: "hero", enabled: true, eyebrow: "Levantine kitchen · Islamabad",
    title: "Charcoal, olive oil and a table full of plates",
    subtitle: "Lamb marinated overnight, bread from the taboon and mezze made by hand every morning. Dine in, take away or have it delivered hot.",
    image: { url: `${IMG}/hero.jpg`, alt: "Charcoal-grilled skewers and vegetables at Zaytoun" },
    alignment: "left", overlay: 0.55, height: "lg",
    primaryCta: { label: "Order online", href: `${BASE}/menu`, style: "primary" },
    secondaryCta: { label: "Book a table", href: `${BASE}/reservation`, style: "outline" },
    highlights: ["Overnight-marinated meats", "Lump charcoal grill", "Delivery in about 40 minutes"],
  },
  {
    type: "order_type_switch", enabled: true, title: "How would you like your order?",
    subtitle: "Delivery across Islamabad, pickup from either kitchen, or dine in with us.",
    orderTypes: ["delivery", "pickup", "dine_in"],
  },
  {
    type: "featured_items", enabled: true, title: "House favourites", subtitle: "The plates our regulars order every week.",
    itemSlugs: ["zaytoun-mixed-grill", "lamb-shank-mansaf", "chicken-shawarma-wrap", "mezze-sharing-platter", "assorted-baklava", "limonana"],
    limit: 6, layout: "grid", cta: { label: "See the full menu", href: `${BASE}/menu`, style: "outline" },
  },
  { type: "menu_categories", enabled: true, title: "Explore the menu", subtitle: "Seven sections, one very busy grill.", limit: 7, showImages: true },
  {
    type: "about", enabled: true, eyebrow: "Our story", title: "A family table that never learned to cut corners",
    body: "Zaytoun began in 2016 with a single charcoal grill, ten tables and our grandmother's recipes. Nine years later the lamb is still marinated overnight, the bread still comes off the taboon minutes before it reaches the table, and the mezze are still made by hand each morning. Generous portions, warm service and no shortcuts.",
    image: { url: `${IMG}/about.jpg`, alt: "Chef plating at Zaytoun" }, imagePosition: "left",
    stats: [
      { value: "2016", label: "Opened in F-7" }, { value: "12h", label: "Overnight marinade" },
      { value: "2", label: "Islamabad kitchens" }, { value: "4.8", label: "Average rating" },
    ],
    cta: { label: "Reserve a table", href: `${BASE}/reservation`, style: "outline" },
  },
  {
    type: "gallery", enabled: true, title: "Inside Zaytoun", subtitle: "Warm light, long tables and a lot of food.",
    images: [
      { url: gal("dining-room"), alt: "The main dining room at Zaytoun F-7" },
      { url: gal("courtyard"), alt: "The courtyard terrace at golden hour" },
      { url: gal("table-spread"), alt: "Plates of grilled meat and fresh salads" },
      { url: gal("kitchen"), alt: "The open kitchen during service" },
      { url: gal("lounge"), alt: "The lounge and majlis seating" },
      { url: gal("cooks"), alt: "Our cooks preparing mezze" },
    ],
    columns: 3,
  },
  {
    type: "why_choose_us", enabled: true, title: "Why guests choose us",
    items: [
      { icon: "flame", title: "Real charcoal", description: "Every skewer is cooked over lump charcoal — never gas, never a shortcut." },
      { icon: "leaf", title: "Made fresh daily", description: "Mezze, dips and pastries are prepared each morning; nothing sits overnight." },
      { icon: "truck", title: "Insulated delivery", description: "Orders leave in heated bags and arrive in about 40 minutes across most areas." },
      { icon: "heart", title: "Family recipes", description: "Marinades and stews follow recipes we've never written down." },
    ],
  },
  { type: "reviews", enabled: true, title: "What our guests say", subtitle: "Real reviews from verified orders.", limit: 6, layout: "grid", showCta: true },
  {
    type: "reservation_cta", enabled: true, title: "Book your table at Zaytoun",
    subtitle: "Courtyard seating and the majlis fill up quickly on weekends — reserve in under a minute.",
    image: { url: gal("dining-room"), alt: "Dining room at Zaytoun" }, phoneLabel: "Or call us",
    cta: { label: "Make a reservation", href: `${BASE}/reservation`, style: "primary" },
  },
  { type: "locations", enabled: true, title: "Find us", subtitle: "Two kitchens in Islamabad, open seven days a week.", showMap: true, limit: 4 },
  { type: "contact", enabled: true, title: "Get in touch", subtitle: "Catering, large groups or feedback? We reply within minutes.", showForm: false },
  {
    type: "cta", enabled: true, title: "Hungry? Your grill is 40 minutes away.", subtitle: "Order online for delivery, pickup or dine-in.",
    tone: "primary", cta: { label: "Start your order", href: `${BASE}/menu`, style: "primary" },
    secondaryCta: { label: "See offers", href: `${BASE}/checkout`, style: "ghost" },
  },
];

export const ABOUT_SECTIONS = [
  {
    type: "hero", enabled: true, eyebrow: "About Zaytoun", title: "Nine years, one grill, no shortcuts",
    subtitle: "The story behind Islamabad's favourite Levantine kitchen.",
    image: { url: gal("kitchen"), alt: "The Zaytoun kitchen" }, height: "sm", alignment: "center",
  },
  {
    type: "rich_text", enabled: true, title: "How it started",
    body: "In 2016 Karim Haddad opened a ten-table restaurant in F-7 Markaz with his grandmother's recipe notebook and a charcoal grill built in Amman. The first week we ran out of lamb on Thursday.\n\nToday two kitchens serve Islamabad, but the rules haven't changed: meat is marinated for twelve hours, bread is baked to order and every mezze is made by hand on the day it is served.",
    width: "narrow",
  },
  {
    type: "why_choose_us", enabled: true, title: "What we stand for",
    items: [
      { icon: "leaf", title: "Ingredients first", description: "Olive oil, sumac and za'atar sourced directly from small Levantine producers." },
      { icon: "flame", title: "Respect the fire", description: "Lump charcoal, patient cooking and nothing hidden under sauce." },
      { icon: "users", title: "Hospitality always", description: "Our team has been with us an average of four years." },
    ],
  },
  {
    type: "gallery", enabled: true, title: "Inside the kitchen",
    images: [{ url: gal("kitchen"), alt: "Kitchen team at work" }, { url: gal("cooks"), alt: "Preparing mezze" }, { url: gal("dining-room"), alt: "The dining room" }],
    columns: 3,
  },
  { type: "cta", enabled: true, title: "Come see for yourself", tone: "neutral", cta: { label: "Book a table", href: `${BASE}/reservation`, style: "primary" } },
];

export const CONTACT_SECTIONS = [
  { type: "hero", enabled: true, eyebrow: "Contact", title: "Talk to Zaytoun", subtitle: "Orders, catering, feedback or press — we reply fast.", height: "sm", alignment: "center" },
  { type: "contact", enabled: true, title: "Get in touch", showForm: true },
  { type: "locations", enabled: true, title: "Our kitchens", showMap: true },
  { type: "cta", enabled: true, title: "Ready to order?", tone: "primary", cta: { label: "Browse the menu", href: `${BASE}/menu`, style: "primary" } },
];

/**
 * Functional pages (menu, reservation, reviews, locations) are website pages too: `page_content` marks where the
 * built-in body (menu list, booking form, reviews, location cards) sits and overrides its heading; the other
 * sections are ordinary, configurable blocks around it.
 */
export const MENU_SECTIONS = [
  {
    type: "page_content", enabled: true, title: "Our menu",
    subtitle: "Charcoal grill, mezze and slow-cooked plates, made fresh to order every day.",
  },
  {
    type: "cta", enabled: true, title: "Feeding a crowd?",
    subtitle: "The mixed grill and the mezze platters are made for sharing. Call us for catering and large orders.",
    tone: "neutral", cta: { label: "Book a table", href: `${BASE}/reservation`, style: "primary" },
    secondaryCta: { label: "See locations", href: `${BASE}/locations`, style: "outline" },
  },
];

export const RESERVATION_SECTIONS = [
  {
    type: "page_content", enabled: true, title: "Reserve your table at Zaytoun",
    subtitle: "Pick a time and you'll get a confirmation code straight away. Courtyard tables and the majlis go first on weekends.",
  },
  {
    type: "why_choose_us", enabled: true, title: "Plan your visit",
    items: [
      { icon: "users", title: "Groups welcome", description: "The majlis seats up to 12 — ask about set menus for celebrations." },
      { icon: "leaf", title: "Courtyard dining", description: "Shaded courtyard seating, lit after dark. Request it in the notes." },
      { icon: "clock", title: "Held for 15 minutes", description: "We keep your table for 15 minutes past your booking time." },
    ],
  },
  {
    type: "gallery", enabled: true, title: "The dining rooms",
    images: [
      { url: gal("dining-room"), alt: "The main dining room at Zaytoun F-7" },
      { url: gal("courtyard"), alt: "The courtyard terrace" },
      { url: gal("lounge"), alt: "The lounge and majlis seating" },
    ],
    columns: 3,
  },
];

export const REVIEWS_SECTIONS = [
  {
    type: "page_content", enabled: true, title: "What our guests say",
    subtitle: "Honest reviews from verified orders and bookings.",
  },
  {
    type: "cta", enabled: true, title: "Hungry after reading all that?",
    subtitle: "Order online for delivery, pickup or dine-in.",
    tone: "primary", cta: { label: "Start your order", href: `${BASE}/menu`, style: "primary" },
  },
];

export const LOCATIONS_SECTIONS = [
  {
    type: "page_content", enabled: true, title: "Find us",
    subtitle: "Two kitchens in Islamabad, open seven days a week. Delivery zones and hours differ per location.",
  },
  { type: "contact", enabled: true, title: "Questions about a large group or catering?", subtitle: "Call or message us; we reply within minutes.", showForm: false },
  {
    type: "cta", enabled: true, title: "Ready to eat?", tone: "neutral",
    cta: { label: "Book a table", href: `${BASE}/reservation`, style: "primary" },
    secondaryCta: { label: "Order online", href: `${BASE}/menu`, style: "outline" },
  },
];

/** [public url, file name, purpose, width, height] for the media library table. */
export const MEDIA: [string, string, string, number, number][] = [
  [`${IMG}/logo.svg`, "zaytoun-logo.svg", "logo", 320, 96],
  [`${IMG}/cover.jpg`, "zaytoun-cover.jpg", "cover", 1920, 1080],
  [`${IMG}/hero.jpg`, "zaytoun-hero.jpg", "hero", 1920, 1080],
  [`${IMG}/about.jpg`, "zaytoun-about.jpg", "website", 1920, 1080],
  ...["dining-room", "courtyard", "table-spread", "kitchen", "lounge", "cooks"].map(
    (name): [string, string, string, number, number] => [gal(name), `${name}.jpg`, "gallery", 1600, 1067],
  ),
];
