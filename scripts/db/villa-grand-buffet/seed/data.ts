/**
 * Villa — The Grand Buffet (Lahore). Buffet restaurant tenant, inserted through the real schema by ./seed.ts.
 *
 * Brand facts come from the restaurant's public listings (two Lahore venues: 67 MM Alam Road, Gulberg III and
 * Canal Commercial, Block M-3A, Lake City; Pakistani, Continental, Pan-Asian and Middle Eastern buffet with live
 * BBQ, tandoor, sushi, hot-pot and dessert stations; 90-minute seatings; royal navy + gold identity). Staff logins,
 * customers, orders, reviews and reservations are demo data: delete them before going live. The email is a
 * placeholder on the reserved `.example` domain because no official address was found. Photos are Unsplash stand-ins.
 */

/** Deterministic, valid v4-shaped uuids: group = kind of row, n = ordinal. Prefix d11a is this tenant's own. */
const uid = (group: number, n: number): string =>
  `d11a${group.toString(16).padStart(4, "0")}-dddd-4ddd-8ddd-${n.toString().padStart(12, "0")}`;

export const IDS = {
  restaurant: uid(1, 1),
  locationGulberg: uid(2, 1),
  locationLakeCity: uid(2, 2),
  website: uid(3, 1),
  pageHome: uid(4, 1),
  pageAbout: uid(4, 2),
  pageContact: uid(4, 3),
  pageMenu: uid(4, 4),
  pageReservation: uid(4, 5),
  pageReviews: uid(4, 6),
  pageLocations: uid(4, 7),
  zoneGulberg: uid(5, 1),
  zoneCentral: uid(5, 2),
  zoneLakeCity: uid(5, 3),
  zoneSouth: uid(5, 4),
  couponWelcome: uid(6, 1),
  couponFamily: uid(6, 2),
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

export const SLUG = "villa-grand-buffet";
const BASE = `/r/${SLUG}`;
const IMG = `/images/${SLUG}`;
const MAIL = "villagrandbuffet.example";

export const RESTAURANT = {
  name: "Villa The Grand Buffet",
  slug: SLUG,
  legalName: "Villa The Grand Buffet",
  tagline: "One Buffet. Many Worlds.",
  city: "Lahore",
  shortDescription: "Pakistani, Continental, Pan-Asian and Middle Eastern cuisine under one roof, with live BBQ, tandoor, sushi and dessert stations — Lahore's grand buffet.",
  description:
    "Villa takes its name from the idea of a house — one home where the world's kitchens sit side by side. Our chefs cook Pakistani classics, Continental plates, Pan-Asian favourites and Middle Eastern grills in front of you at live stations, from the charcoal BBQ and tandoor to sushi, hot pot and a dessert counter the children never want to leave. Two elegant dining halls in Lahore, in Gulberg and Lake City, built for families, friends and celebrations.",
  cuisines: ["Buffet", "Pakistani", "Continental", "Pan-Asian", "Middle Eastern", "BBQ"],
  phone: "+92 311 1777241",
  whatsapp: "+92 311 1777241",
  email: `reservations@${MAIL}`,
  websiteUrl: "https://www.instagram.com/villagrandbuffet/",
  currency: "PKR",
  currencySymbol: "Rs",
  timezone: "Asia/Karachi",
  social: {
    instagram: "https://www.instagram.com/villagrandbuffet/",
    facebook: "https://www.facebook.com/villagrandbuffet/",
    youtube: "https://www.youtube.com/@villathegrandbuffet",
  },
  logo: `${IMG}/logo.svg`,
  cover: `${IMG}/cover.jpg`,
};

export const SETTINGS = {
  tax: { enabled: true, rate: 16, included: false, applyOnDeliveryFee: false, label: "Sales tax" },
  serviceFee: { enabled: false, rate: 0, orderTypes: ["dine_in"] },
  ordering: {
    onlineOrderingEnabled: true,
    minimumOrderAmount: 1500,
    maxAdvanceDays: 5,
    allowScheduledOrders: true,
    preparationTimeMinutes: 30,
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
    slotMinutes: 15,
    minGuests: 1,
    maxGuests: 30,
    autoConfirm: false,
    maxAdvanceDays: 30,
    // Every buffet seating is 90 minutes.
    defaultDurationMinutes: 90,
    tables: [
      { name: "T2-1", seats: 2 },
      { name: "T2-2", seats: 2 },
      { name: "T4-1", seats: 4 },
      { name: "T4-2", seats: 4 },
      { name: "T4-3", seats: 4 },
      { name: "T6-1", seats: 6 },
      { name: "T6-2", seats: 6 },
      { name: "T8-1", seats: 8 },
      { name: "T10 Family", seats: 10 },
      { name: "Private Hall", seats: 30 },
    ],
  },
  delivery: { enabled: true, defaultEtaMinutes: 50, freeDeliveryOver: null, trackingEnabled: true },
  loyalty: { enabled: false, pointsPerCurrencyUnit: 1, redeemRate: 0.01 },
  receipt: { footerNote: "Thank you for dining at Villa. One Buffet. Many Worlds.", showTaxNumber: false },
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

// Lunch / hi-tea seatings start at 12:45, the last dinner seating ends at 23:00 (public timings).
const SERVICE = [{ open: "12:45", close: "23:00" }];
const HOURS = { mon: SERVICE, tue: SERVICE, wed: SERVICE, thu: SERVICE, fri: SERVICE, sat: SERVICE, sun: SERVICE };

export const LOCATIONS = [
  {
    id: IDS.locationGulberg, name: "Gulberg", slug: "gulberg", primary: true,
    line1: "67 MM Alam Road, Block B1, Gulberg III", area: "Gulberg III", city: "Lahore", state: "Punjab",
    postalCode: "54660", phone: "+92 311 1777241", latitude: 31.5157, longitude: 74.3511, hours: HOURS,
    settings: { privateHall: true, kidsCorner: true, parking: true },
  },
  {
    id: IDS.locationLakeCity, name: "Lake City", slug: "lake-city", primary: false,
    line1: "Plot C43-25, Canal Commercial, Block M-3A", area: "Lake City", city: "Lahore", state: "Punjab",
    postalCode: null, phone: "+92 311 1777480", latitude: 31.3657, longitude: 74.2410, hours: HOURS,
    settings: { privateHall: true, kidsCorner: true, parking: true },
  },
];

/**
 * Royal navy + gold, taken from the Villa logo (navy ground #0F2451, gold line art ~#C6A15B), on a warm ivory
 * so the site is not dark overall. The accent is an antique gold, a shade deeper than the logo gold so it still
 * reads on ivory (3.3:1, icons/stars) as well as on the night navy (4.8:1); badge text on it is night navy (4.8:1).
 */
export const THEME = {
  name: "Royal Navy & Gold",
  primary: "#13295B",
  primaryForeground: "#FFFFFF",
  secondary: "#0F2451",
  accent: "#A8823A",
  background: "#FBF8F1",
  surface: "#FFFFFF",
  foreground: "#141B2D",
  muted: "#625E55",
  border: "#E8E1D2",
  font: "Cormorant Garamond",
  bodyFont: "Manrope",
  radius: "md",
  dark: false,
  surfaceMuted: "#F4EFE4",
  surfaceDark: "#0C1A3F",
  foregroundOnDark: "#F7F2E7",
  accentForeground: "#0C1A3F",
};

export const NAV = [
  { label: "Home", href: BASE, enabled: true },
  { label: "Menu", href: `${BASE}/menu`, enabled: true },
  { label: "The Buffet", href: `${BASE}/about`, enabled: true },
  { label: "Reservations", href: `${BASE}/reservation`, enabled: true },
  { label: "Reviews", href: `${BASE}/reviews`, enabled: true },
  { label: "Locations", href: `${BASE}/locations`, enabled: true },
];

// Demo staff logins (role accounts, no real people).
export const TEAM = [
  { id: IDS.userOwner, member: IDS.memberOwner, email: `owner@${MAIL}`, name: "Villa Owner", role: "owner", password: "VillaGrand#1", phone: "+92 300 0000001" },
  { id: IDS.userAdmin, member: IDS.memberAdmin, email: `admin@${MAIL}`, name: "Villa Admin", role: "admin", password: "VillaGrand#2", phone: "+92 300 0000002" },
  { id: IDS.userManager, member: IDS.memberManager, email: `manager@${MAIL}`, name: "Floor Manager", role: "manager", password: "VillaGrand#3", phone: "+92 300 0000003" },
  { id: IDS.userStaff, member: IDS.memberStaff, email: `kitchen@${MAIL}`, name: "Kitchen Pass", role: "staff", password: "VillaGrand#4", phone: "+92 300 0000004" },
];
/** Staff name written on seeded order status changes. */
export const SHIFT_LEAD = "Floor Manager";

// ---------------------------------------------------------------------------
// Menu — Villa at Home: signature dishes from the buffet stations, for takeaway, delivery and à la carte.
// The per-head buffet itself is booked through reservations (see the home/about page content).
// ---------------------------------------------------------------------------
export interface SeedCategory { slug: string; name: string; description: string; image: string; icon: string; featured?: boolean }

const m = (file: string) => `${IMG}/menu/${file}.jpg`;

export const CATEGORIES: SeedCategory[] = [
  { slug: "bbq-tandoor", name: "BBQ & Tandoor", description: "From the live charcoal and tandoor stations.", image: m("bbq-platter"), icon: "flame", featured: true },
  { slug: "desi-classics", name: "Pakistani Classics", description: "Karahi, handi and biryani, cooked the Lahori way.", image: m("butter-chicken"), icon: "chef-hat", featured: true },
  { slug: "pan-asian", name: "Pan-Asian & Sushi", description: "Sushi rolled to order, dim sum and wok-fired noodles.", image: m("sushi-boat"), icon: "utensils", featured: true },
  { slug: "seafood", name: "Premium Seafood", description: "Prawns and salmon, grilled and finished at the station.", image: m("garlic-prawns"), icon: "sparkles" },
  { slug: "continental", name: "Continental", description: "Pasta, steaks and bakes from the Continental kitchen.", image: m("steak-frites"), icon: "beef" },
  { slug: "arabic", name: "Arabic Corner", description: "Mandi, shawarma and mezze from the Middle Eastern station.", image: m("lamb-mandi"), icon: "wheat" },
  { slug: "desserts", name: "Desserts", description: "The dessert counter, boxed to take home.", image: m("petit-fours"), icon: "cake", featured: true },
  { slug: "beverages", name: "Beverages", description: "Fresh, cold and freshly brewed.", image: m("mint-margarita"), icon: "cup-soda" },
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

const BREAD: SeedAddonGroup = {
  name: "Bread", maxSelect: 3,
  addons: [
    { name: "Tandoori naan", price: "80.00", maxQuantity: 6 },
    { name: "Garlic naan", price: "150.00", maxQuantity: 6 },
    { name: "Roghni naan", price: "120.00", maxQuantity: 6 },
  ],
};
const SIDES: SeedAddonGroup = {
  name: "Sides", maxSelect: 3,
  addons: [
    { name: "Raita", price: "150.00" },
    { name: "Mint chutney", price: "100.00" },
    { name: "Kachumber salad", price: "220.00" },
    { name: "Garlic mayo", price: "120.00" },
  ],
};
const HEAT: SeedAddonGroup = {
  name: "Spice level", isRequired: true, minSelect: 1, maxSelect: 1,
  addons: [{ name: "Mild", price: "0.00" }, { name: "Medium", price: "0.00", isDefault: true }, { name: "Hot", price: "0.00" }],
};
const STEAK_SAUCE: SeedAddonGroup = {
  name: "Sauce", isRequired: true, minSelect: 1, maxSelect: 1,
  addons: [{ name: "Mushroom", price: "0.00", isDefault: true }, { name: "Black pepper", price: "0.00" }, { name: "Garlic butter", price: "0.00" }],
};

export const ITEMS: SeedItem[] = [
  // ── BBQ & Tandoor ────────────────────────────────────────────────────────
  {
    name: "Villa Grand BBQ Platter", slug: "villa-grand-bbq-platter", category: "bbq-tandoor", image: m("bbq-platter"),
    price: "5450.00", featured: true, prepTime: 35, calories: 2400, spiceLevel: 1,
    shortDescription: "Tikka, malai boti, seekh kebab, wings",
    description: "The BBQ station on one platter: chicken tikka, malai boti, beef seekh kebab and fiery wings over grilled onions and peppers, with naan, raita and mint chutney.",
    dietaryTags: ["halal"], allergens: ["dairy", "gluten"],
    variants: [{ name: "Serves 4", price: "5450.00", isDefault: true }, { name: "Serves 8", price: "9950.00" }],
    addonGroups: [BREAD, SIDES],
  },
  {
    name: "Chicken Tikka", slug: "chicken-tikka", category: "bbq-tandoor", image: m("chicken-tikka"),
    price: "1450.00", prepTime: 25, spiceLevel: 2,
    description: "Bone-in chicken quarters marinated overnight in yoghurt, lemon and red chilli, then charred over coals.",
    dietaryTags: ["halal", "gluten-free"], allergens: ["dairy"],
    variants: [{ name: "2 pieces", price: "1450.00", isDefault: true }, { name: "4 pieces", price: "2750.00" }],
    addonGroups: [HEAT, BREAD, SIDES],
  },
  {
    name: "Malai Boti", slug: "malai-boti", category: "bbq-tandoor", image: m("malai-boti"),
    price: "1650.00", prepTime: 22,
    description: "Boneless chicken in a cream, cheese and white-pepper marinade, grilled until just charred at the edges.",
    dietaryTags: ["halal", "gluten-free"], allergens: ["dairy"],
    addonGroups: [BREAD, SIDES],
  },
  {
    name: "Beef Seekh Kebab", slug: "beef-seekh-kebab", category: "bbq-tandoor", image: m("seekh-kebab"),
    price: "1550.00", prepTime: 22, spiceLevel: 2,
    description: "Hand-minced beef with green chilli, ginger and garam masala, skewered and cooked over live coals.",
    dietaryTags: ["halal", "gluten-free"],
    variants: [{ name: "4 skewers", price: "1550.00", isDefault: true }, { name: "8 skewers", price: "2950.00" }],
    addonGroups: [HEAT, BREAD, SIDES],
  },
  {
    name: "Tandoori Chicken", slug: "tandoori-chicken", category: "bbq-tandoor", image: m("tandoori-chicken"),
    price: "1890.00", prepTime: 30, spiceLevel: 1,
    description: "A whole spatchcocked chicken in tandoori masala, roasted in the clay oven and finished with lemon and chaat masala.",
    dietaryTags: ["halal", "gluten-free"], allergens: ["dairy"],
    variants: [{ name: "Half", price: "1890.00", isDefault: true }, { name: "Whole", price: "3450.00" }],
    addonGroups: [BREAD, SIDES],
  },
  {
    name: "Smoked Beef Ribs", slug: "smoked-beef-ribs", category: "bbq-tandoor", image: m("beef-ribs"),
    price: "3950.00", prepTime: 30,
    description: "Beef short ribs smoked low and slow, glazed with a sticky tamarind BBQ sauce and served with pickled onion.",
    dietaryTags: ["halal", "gluten-free"],
  },

  // ── Pakistani Classics ───────────────────────────────────────────────────
  {
    name: "Butter Chicken", slug: "butter-chicken", category: "desi-classics", image: m("butter-chicken"),
    price: "1850.00", featured: true, prepTime: 25,
    shortDescription: "Tandoori chicken in a silky tomato-butter gravy",
    description: "Tandoor-roasted chicken simmered in a velvety tomato, butter and fenugreek gravy, finished with fresh cream — a buffet favourite.",
    dietaryTags: ["halal", "gluten-free"], allergens: ["dairy", "nuts"],
    variants: [{ name: "Half", price: "1850.00", isDefault: true }, { name: "Full", price: "3350.00" }],
    addonGroups: [BREAD],
  },
  {
    name: "Chicken Karahi", slug: "chicken-karahi", category: "desi-classics", image: m("chicken-karahi"),
    price: "2350.00", prepTime: 30, spiceLevel: 2,
    description: "Lahori-style karahi cooked in the wok with tomatoes, green chillies, ginger and a knob of desi ghee.",
    dietaryTags: ["halal", "gluten-free"], allergens: ["dairy"],
    variants: [{ name: "Half", price: "2350.00", isDefault: true }, { name: "Full", price: "4450.00" }],
    addonGroups: [HEAT, BREAD],
  },
  {
    name: "Mutton Qeema Khara Masala", slug: "mutton-qeema-khara-masala", category: "desi-classics", image: m("qeema-khara-masala"),
    price: "2650.00", prepTime: 25, spiceLevel: 2,
    description: "Minced mutton cooked with whole spices, green chillies and fresh coriander until dry and deeply savoury.",
    dietaryTags: ["halal", "gluten-free"],
    addonGroups: [HEAT, BREAD],
  },
  {
    name: "Mutton Biryani", slug: "mutton-biryani", category: "desi-classics", image: m("mutton-biryani"),
    price: "2250.00", featured: true, prepTime: 20, spiceLevel: 2,
    description: "Aged basmati layered with slow-cooked mutton, saffron, fried onions and mint, sealed and cooked on dum.",
    dietaryTags: ["halal"], allergens: ["dairy"],
    variants: [{ name: "Serves 2", price: "2250.00", isDefault: true }, { name: "Serves 4", price: "4150.00" }],
    addonGroups: [SIDES],
  },
  {
    name: "Daal Makhni", slug: "daal-makhni", category: "desi-classics", image: m("daal-makhni"),
    price: "1150.00", prepTime: 15,
    description: "Black lentils simmered overnight with butter and cream, served with a basket of warm naan.",
    dietaryTags: ["vegetarian", "halal"], allergens: ["dairy", "gluten"],
    addonGroups: [BREAD],
  },

  // ── Pan-Asian & Sushi ────────────────────────────────────────────────────
  {
    name: "Villa Sushi Boat", slug: "villa-sushi-boat", category: "pan-asian", image: m("sushi-boat"),
    price: "6950.00", featured: true, prepTime: 25,
    shortDescription: "32 pieces from the sushi station",
    description: "Thirty-two pieces from the sushi station: salmon and prawn tempura maki, California rolls, crunchy dragon rolls and nigiri, with soy, wasabi and pickled ginger.",
    dietaryTags: ["halal"], allergens: ["fish", "shellfish", "gluten", "sesame", "eggs"],
  },
  {
    name: "Salmon Avocado Maki", slug: "salmon-avocado-maki", category: "pan-asian", image: m("salmon-maki"),
    price: "2150.00", prepTime: 15,
    description: "Eight pieces of fresh salmon and avocado rolled in sushi rice and nori, topped with sesame.",
    dietaryTags: ["halal"], allergens: ["fish", "sesame"],
  },
  {
    name: "Steamed Dim Sum Basket", slug: "steamed-dim-sum", category: "pan-asian", image: m("dim-sum"),
    price: "1450.00", prepTime: 15,
    description: "Six chicken and prawn dumplings steamed in bamboo, with chilli oil and black-vinegar dip.",
    dietaryTags: ["halal"], allergens: ["gluten", "shellfish", "sesame"],
  },
  {
    name: "Prawn Gyoza", slug: "prawn-gyoza", category: "pan-asian", image: m("prawn-gyoza"),
    price: "1650.00", prepTime: 15,
    description: "Pan-fried dumplings filled with prawn, cabbage and ginger, crisp on the bottom and served with ponzu.",
    dietaryTags: ["halal"], allergens: ["gluten", "shellfish", "sesame"],
  },
  {
    name: "Chicken Chow Mein", slug: "chicken-chow-mein", category: "pan-asian", image: m("chow-mein"),
    price: "1350.00", prepTime: 15, spiceLevel: 1,
    description: "Wok-tossed egg noodles with chicken, bok choy, peppers and spring onion in a smoky soy glaze.",
    dietaryTags: ["halal"], allergens: ["gluten", "eggs", "soy"],
  },
  {
    name: "Spicy Prawn Ramen", slug: "spicy-prawn-ramen", category: "pan-asian", image: m("spicy-ramen"),
    price: "1950.00", prepTime: 18, spiceLevel: 2,
    description: "Rich chicken broth with chilli paste, ramen noodles, king prawns, a soy-marinated egg and greens.",
    dietaryTags: ["halal"], allergens: ["gluten", "eggs", "shellfish", "soy"],
  },

  // ── Premium Seafood ──────────────────────────────────────────────────────
  {
    name: "Garlic Butter Prawns", slug: "garlic-butter-prawns", category: "seafood", image: m("garlic-prawns"),
    price: "3250.00", featured: true, prepTime: 18,
    description: "King prawns sizzled in garlic butter with chilli flakes, lemon and basil, served in the pan.",
    dietaryTags: ["halal", "gluten-free"], allergens: ["shellfish", "dairy"],
  },
  {
    name: "Jumbo Prawn Platter", slug: "jumbo-prawn-platter", category: "seafood", image: m("prawn-platter"),
    price: "4950.00", prepTime: 22,
    description: "Jumbo prawns grilled in the shell with a lemon-pepper rub, with garlic sauce and a green salad.",
    dietaryTags: ["halal", "gluten-free"], allergens: ["shellfish"],
    variants: [{ name: "500 g", price: "4950.00", isDefault: true }, { name: "1 kg", price: "8950.00" }],
  },
  {
    name: "Grilled Norwegian Salmon", slug: "grilled-salmon", category: "seafood", image: m("grilled-salmon"),
    price: "4450.00", prepTime: 22,
    description: "Salmon fillet grilled skin-side down with herb butter and lime, over sautéed greens.",
    dietaryTags: ["halal", "gluten-free"], allergens: ["fish", "dairy"],
  },

  // ── Continental ──────────────────────────────────────────────────────────
  {
    name: "Beef Tenderloin Steak", slug: "beef-tenderloin-steak", category: "continental", image: m("steak-frites"),
    price: "3650.00", prepTime: 25,
    description: "Grain-fed tenderloin seared to your liking, with fries, grilled vegetables and your choice of sauce.",
    dietaryTags: ["halal"], allergens: ["dairy"],
    addonGroups: [STEAK_SAUCE],
  },
  {
    name: "Chicken Fettuccine Alfredo", slug: "chicken-fettuccine-alfredo", category: "continental", image: m("fettuccine-alfredo"),
    price: "1750.00", prepTime: 18,
    description: "Fettuccine in a parmesan cream sauce with grilled chicken, mushrooms and cracked black pepper.",
    dietaryTags: ["halal"], allergens: ["gluten", "dairy", "eggs"],
  },
  {
    name: "Penne Arrabbiata", slug: "penne-arrabbiata", category: "continental", image: m("penne-arrabbiata"),
    price: "1450.00", prepTime: 15, spiceLevel: 2,
    description: "Penne in a garlicky tomato and red-chilli sauce with basil and parmesan.",
    dietaryTags: ["vegetarian", "halal"], allergens: ["gluten", "dairy"],
  },
  {
    name: "Beef Lasagna", slug: "beef-lasagna", category: "continental", image: m("beef-lasagna"),
    price: "1950.00", prepTime: 20,
    description: "Layers of pasta, slow-cooked beef ragù, béchamel and mozzarella, baked until golden.",
    dietaryTags: ["halal"], allergens: ["gluten", "dairy", "eggs"],
  },

  // ── Arabic Corner ────────────────────────────────────────────────────────
  {
    name: "Lamb Mandi", slug: "lamb-mandi", category: "arabic", image: m("lamb-mandi"),
    price: "3450.00", featured: true, prepTime: 25,
    description: "Slow-cooked lamb over smoky, spiced mandi rice with toasted nuts, raisins and a tomato-chilli salsa.",
    dietaryTags: ["halal", "gluten-free"], allergens: ["nuts"],
    variants: [{ name: "Serves 2", price: "3450.00", isDefault: true }, { name: "Serves 4", price: "6450.00" }],
  },
  {
    name: "Chicken Shawarma Platter", slug: "chicken-shawarma-platter", category: "arabic", image: m("shawarma-platter"),
    price: "1650.00", prepTime: 15,
    description: "Spit-roasted chicken sliced over fries with garlic toum, pickles and warm Arabic bread.",
    dietaryTags: ["halal"], allergens: ["gluten"],
  },
  {
    name: "Mezze Platter", slug: "mezze-platter", category: "arabic", image: m("mezze-platter"),
    price: "2250.00", prepTime: 15,
    description: "Hummus, moutabal, falafel, tabbouleh and pickles with warm pita — made for sharing.",
    dietaryTags: ["vegetarian", "halal"], allergens: ["gluten", "sesame"],
  },

  // ── Desserts ─────────────────────────────────────────────────────────────
  {
    name: "Petit Four Box", slug: "petit-four-box", category: "desserts", image: m("petit-fours"),
    price: "2450.00", featured: true, prepTime: 5,
    description: "A dozen bite-size pastries from the dessert counter: fruit tarts, chocolate cups, mini cupcakes and macarons.",
    dietaryTags: ["vegetarian"], allergens: ["gluten", "dairy", "eggs", "nuts"],
  },
  {
    name: "Shahi Zarda", slug: "shahi-zarda", category: "desserts", image: m("zarda"),
    price: "950.00", prepTime: 5,
    description: "Saffron sweet rice with cardamom, khoya, candied fruit and slivered almonds.",
    dietaryTags: ["vegetarian", "halal", "gluten-free"], allergens: ["dairy", "nuts"],
  },
  {
    name: "Pistachio Baklava", slug: "pistachio-baklava", category: "desserts", image: m("baklava"),
    price: "1450.00", prepTime: 5,
    description: "Crisp filo layered with pistachio and walnut, soaked in orange-blossom syrup.",
    dietaryTags: ["vegetarian", "halal"], allergens: ["gluten", "nuts", "dairy"],
    variants: [{ name: "6 pieces", price: "1450.00", isDefault: true }, { name: "12 pieces", price: "2650.00" }],
  },
  {
    name: "Molten Chocolate Cake", slug: "molten-chocolate-cake", category: "desserts", image: m("molten-cake"),
    price: "1150.00", prepTime: 12,
    description: "Warm dark chocolate cake with a soft centre and chocolate ganache.",
    dietaryTags: ["vegetarian"], allergens: ["gluten", "dairy", "eggs"],
  },
  {
    name: "Classic Tiramisu", slug: "classic-tiramisu", category: "desserts", image: m("tiramisu"),
    price: "1250.00", prepTime: 5,
    description: "Espresso-soaked ladyfingers with mascarpone cream and cocoa.",
    dietaryTags: ["vegetarian"], allergens: ["gluten", "dairy", "eggs"],
  },

  // ── Beverages ────────────────────────────────────────────────────────────
  {
    name: "Mint Margarita", slug: "mint-margarita", category: "beverages", image: m("mint-margarita"),
    price: "550.00", prepTime: 4,
    description: "Fresh mint and lemon blended with crushed ice — the Lahori summer classic.",
    dietaryTags: ["vegan", "halal", "gluten-free"],
    variants: [{ name: "Glass", price: "550.00", isDefault: true }, { name: "1 litre jug", price: "1450.00" }],
  },
  {
    name: "Fresh Orange Juice", slug: "fresh-orange-juice", category: "beverages", image: m("orange-juice"),
    price: "650.00", prepTime: 4,
    description: "Squeezed to order, nothing added.",
    dietaryTags: ["vegan", "halal", "gluten-free"],
  },
  {
    name: "Kashmiri Chai", slug: "kashmiri-chai", category: "beverages", image: m("karak-chai"),
    price: "450.00", prepTime: 6,
    description: "Pink tea brewed with cardamom and milk, topped with crushed pistachio and almond.",
    dietaryTags: ["vegetarian", "halal", "gluten-free"], allergens: ["dairy", "nuts"],
  },
];

export const ZONES = [
  { id: IDS.zoneGulberg, locationId: IDS.locationGulberg, name: "Gulberg & MM Alam", description: "Delivered from Villa Gulberg.",
    areas: ["Gulberg I", "Gulberg II", "Gulberg III", "MM Alam Road", "Main Market"], postalCodes: ["54660"], fee: "150.00", minOrder: "2000.00", freeOver: "8000.00", etaMin: 35, etaMax: 50 },
  { id: IDS.zoneCentral, locationId: IDS.locationGulberg, name: "Model Town, Garden Town & Cantt", areas: ["Model Town", "Garden Town", "Faisal Town", "Lahore Cantt", "Cavalry Ground"], postalCodes: ["54700", "54810"], fee: "250.00", minOrder: "2500.00", freeOver: null, etaMin: 45, etaMax: 65 },
  { id: IDS.zoneLakeCity, locationId: IDS.locationLakeCity, name: "Lake City & Raiwind Road", description: "Delivered from Villa Lake City.", areas: ["Lake City", "Raiwind Road", "Valencia", "EME Society"], postalCodes: [], fee: "150.00", minOrder: "2000.00", freeOver: "8000.00", etaMin: 35, etaMax: 50 },
  { id: IDS.zoneSouth, locationId: IDS.locationLakeCity, name: "Johar Town, Bahria & DHA", areas: ["Johar Town", "Bahria Town", "DHA Phase 6", "DHA Phase 7", "Wapda Town"], postalCodes: ["54782"], fee: "300.00", minOrder: "3000.00", freeOver: null, etaMin: 50, etaMax: 75 },
];

export const COUPONS = [
  { id: IDS.couponWelcome, code: "VILLA10", description: "10% off your first order", type: "percentage", value: "10.00", minOrder: "3000.00", maxDiscount: "1000.00", appliesTo: "order", usageLimit: 500, perCustomer: 1, startsAt: -30, endsAt: 150, active: true },
  { id: IDS.couponFamily, code: "FAMILY1000", description: "Rs 1,000 off family orders above Rs 10,000", type: "fixed", value: "1000.00", minOrder: "10000.00", maxDiscount: null, appliesTo: "order", usageLimit: null, perCustomer: 3, startsAt: -60, endsAt: 90, active: true },
  { id: IDS.couponFreeDelivery, code: "FREESHIP", description: "Free delivery on orders above Rs 5,000", type: "fixed", value: "300.00", minOrder: "5000.00", maxDiscount: null, appliesTo: "delivery_fee", usageLimit: 300, perCustomer: null, startsAt: -10, endsAt: 60, active: true },
  { id: IDS.couponExpired, code: "EID20", description: "20% Eid offer (expired)", type: "percentage", value: "20.00", minOrder: "4000.00", maxDiscount: "1500.00", appliesTo: "order", usageLimit: 200, perCustomer: 1, startsAt: -400, endsAt: -300, active: true },
];

// ---------------------------------------------------------------------------
// Demo people, reviews, reservations, orders (fictional; example.com addresses)
// ---------------------------------------------------------------------------
const c = (n: number) => uid(9, n);
export const CUSTOMERS = [
  { id: c(1), name: "Amna Tariq", phone: "+92 300 1112201", email: "amna.tariq@example.com", account: false, address: { label: "Home", line1: "House 21, Block D", area: "Gulberg III", city: "Lahore", postalCode: "54660" } },
  { id: c(2), name: "Kamran Aslam", phone: "+92 321 1112202", email: "kamran.aslam@example.com", account: false, address: { label: "Office", line1: "Floor 3, Main Boulevard", area: "Gulberg II", city: "Lahore", postalCode: "54660" } },
  { id: c(3), name: "Zainab Farooq", phone: "+92 333 1112203", email: "zainab.farooq@example.com", account: true, address: { label: "Home", line1: "House 45, Block M-3", area: "Lake City", city: "Lahore", postalCode: null } },
  { id: c(4), name: "Omer Saeed", phone: "+92 345 1112204", email: "omer.saeed@example.com", account: false, address: { label: "Home", line1: "House 7, Block G", area: "Model Town", city: "Lahore", postalCode: "54700" } },
  { id: c(5), name: "Sadia Khalid", phone: "+92 301 1112205", email: "sadia.khalid@example.com", account: false, address: { label: "Home", line1: "House 88, Sector C", area: "Bahria Town", city: "Lahore", postalCode: null } },
  { id: c(6), name: "Imran Butt", phone: "+92 302 1112206", email: "imran.butt@example.com", account: false, address: { label: "Home", line1: "House 12, Block K", area: "Johar Town", city: "Lahore", postalCode: "54782" } },
  { id: c(7), name: "Maryam Ali", phone: "+92 311 1112207", email: "maryam.ali@example.com", account: true, address: { label: "Home", line1: "House 3, Street 9", area: "Lake City", city: "Lahore", postalCode: null } },
  { id: c(8), name: "Hamza Nadeem", phone: "+92 336 1112208", email: "hamza.nadeem@example.com", account: false, address: { label: "Home", line1: "House 51, Block B", area: "Garden Town", city: "Lahore", postalCode: "54700" } },
];
const cust = (n: number) => CUSTOMERS[n - 1]!;

export const REVIEWS = [
  { customer: 1, itemSlug: "villa-grand-bbq-platter", author: "Amna Tariq", rating: 5, title: "The BBQ platter fed the whole family", comment: "Malai boti was melt-in-the-mouth and the seekh kebabs had real char. Arrived hot, with plenty of naan.", status: "approved", featured: true, daysAgo: 3 },
  { customer: 2, itemSlug: "villa-sushi-boat", author: "Kamran Aslam", rating: 5, title: "Sushi that actually tastes fresh", comment: "Ordered the sushi boat for an office lunch. Neatly packed, generous and every roll was fresh.", status: "approved", featured: true, daysAgo: 6 },
  { customer: 3, itemSlug: "butter-chicken", author: "Zainab Farooq", rating: 5, title: "Just like the buffet", comment: "The butter chicken is exactly what I go back for at the buffet — creamy and smoky. Great with garlic naan.", status: "approved", featured: true, daysAgo: 9 },
  { customer: 4, itemSlug: "mutton-biryani", author: "Omer Saeed", rating: 4, title: "Proper dum biryani", comment: "Tender mutton and fragrant rice. I'd like a touch more spice, but the portion for four is generous.", status: "approved", featured: false, daysAgo: 12 },
  { customer: 5, itemSlug: "garlic-butter-prawns", author: "Sadia Khalid", rating: 5, title: "Worth every rupee", comment: "Big prawns, lots of garlic butter and bread to mop it up. Our new Friday treat.", status: "approved", featured: true, daysAgo: 16 },
  { customer: 6, itemSlug: "petit-four-box", author: "Imran Butt", rating: 5, title: "Beautiful dessert box", comment: "Took it to a dinner as a gift and it looked stunning. The chocolate cups disappeared first.", status: "approved", featured: false, daysAgo: 20 },
  { customer: 7, itemSlug: "lamb-mandi", author: "Maryam Ali", rating: 4, title: "Lovely mandi", comment: "Soft lamb and smoky rice. The salsa on the side makes it.", status: "pending", featured: false, daysAgo: 1 },
  { customer: null, itemSlug: "chicken-chow-mein", author: "Anonymous", rating: 2, title: "Late delivery", comment: "Food was fine but it took over an hour on a Saturday night.", status: "rejected", featured: false, daysAgo: 25 },
];

export const RESERVATIONS = [
  { customer: 1, daysAhead: 1, time: "19:45", guests: 6, table: "T6-1", status: "confirmed", occasion: "Birthday", requests: "Birthday cake at the table, please." },
  { customer: 2, daysAhead: 2, time: "12:45", guests: 12, table: null, status: "confirmed", occasion: "Team lunch", requests: "Two tables together if possible." },
  { customer: 4, daysAhead: 3, time: "21:30", guests: 4, table: "T4-1", status: "pending", occasion: null, requests: null },
  { customer: 5, daysAhead: 5, time: "16:15", guests: 8, table: "T8-1", status: "pending", occasion: "Family hi-tea", requests: "Two children aged 5 and 6." },
  { customer: 3, daysAhead: -3, time: "19:45", guests: 10, table: "T10 Family", status: "completed", occasion: "Anniversary", requests: null },
  { customer: 6, daysAhead: -1, time: "14:30", guests: 2, table: "T2-1", status: "no_show", occasion: null, requests: null },
];

export interface SeedOrder {
  customer: number;
  location: "gulberg" | "lakeCity";
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
  { customer: 1, location: "gulberg", orderType: "delivery", status: "pending", hoursAgo: 0.2, zoneId: IDS.zoneGulberg, paymentMethod: "cash_on_delivery", paymentStatus: "pending", couponCode: "VILLA10", notes: "Please call on arrival.",
    items: [{ slug: "villa-grand-bbq-platter", quantity: 1, variant: "Serves 4", addons: ["Garlic naan", "Raita"] }, { slug: "mint-margarita", quantity: 1, variant: "1 litre jug" }] },
  { customer: 2, location: "gulberg", orderType: "delivery", status: "confirmed", hoursAgo: 0.5, zoneId: IDS.zoneCentral, paymentMethod: "cash_on_delivery", paymentStatus: "pending",
    items: [{ slug: "villa-sushi-boat", quantity: 1 }, { slug: "steamed-dim-sum", quantity: 2 }, { slug: "chicken-chow-mein", quantity: 2 }] },
  { customer: 3, location: "lakeCity", orderType: "delivery", status: "preparing", hoursAgo: 0.8, zoneId: IDS.zoneLakeCity, paymentMethod: "cash_on_delivery", paymentStatus: "pending", couponCode: "FAMILY1000",
    items: [{ slug: "butter-chicken", quantity: 1, variant: "Full", addons: ["Garlic naan"] }, { slug: "mutton-biryani", quantity: 1, variant: "Serves 4" }, { slug: "petit-four-box", quantity: 1 }] },
  { customer: 4, location: "gulberg", orderType: "pickup", status: "ready", hoursAgo: 0.6, paymentMethod: "card_terminal", paymentStatus: "pending",
    items: [{ slug: "chicken-karahi", quantity: 1, variant: "Full", addons: ["Medium", "Tandoori naan"] }, { slug: "daal-makhni", quantity: 1 }] },
  { customer: 5, location: "lakeCity", orderType: "delivery", status: "out_for_delivery", hoursAgo: 1.2, zoneId: IDS.zoneSouth, paymentMethod: "cash_on_delivery", paymentStatus: "pending", couponCode: "FREESHIP",
    items: [{ slug: "garlic-butter-prawns", quantity: 1 }, { slug: "grilled-salmon", quantity: 1 }, { slug: "fresh-orange-juice", quantity: 2 }] },
  { customer: 6, location: "gulberg", orderType: "delivery", status: "completed", hoursAgo: 26, zoneId: IDS.zoneGulberg, paymentMethod: "cash_on_delivery", paymentStatus: "paid",
    items: [{ slug: "beef-tenderloin-steak", quantity: 2, addons: ["Black pepper"] }, { slug: "chicken-fettuccine-alfredo", quantity: 1 }, { slug: "classic-tiramisu", quantity: 2 }] },
  { customer: 7, location: "lakeCity", orderType: "pickup", status: "completed", hoursAgo: 30, paymentMethod: "card_terminal", paymentStatus: "paid",
    items: [{ slug: "lamb-mandi", quantity: 1, variant: "Serves 4" }, { slug: "mezze-platter", quantity: 1 }] },
  { customer: 3, location: "lakeCity", orderType: "dine_in", status: "completed", hoursAgo: 52, tableNumber: "T10 Family", guests: 10, paymentMethod: "card_terminal", paymentStatus: "paid",
    items: [{ slug: "pistachio-baklava", quantity: 1, variant: "12 pieces" }, { slug: "kashmiri-chai", quantity: 10 }] },
  { customer: 8, location: "gulberg", orderType: "delivery", status: "completed", hoursAgo: 75, zoneId: IDS.zoneCentral, paymentMethod: "cash_on_delivery", paymentStatus: "paid",
    items: [{ slug: "chicken-tikka", quantity: 2, variant: "4 pieces", addons: ["Hot", "Mint chutney"] }, { slug: "beef-seekh-kebab", quantity: 1, variant: "8 skewers", addons: ["Medium", "Tandoori naan"] }] },
  { customer: 2, location: "gulberg", orderType: "delivery", status: "cancelled", hoursAgo: 100, zoneId: IDS.zoneCentral, paymentMethod: "cash_on_delivery", paymentStatus: "cancelled", notes: "Customer requested cancellation — plans changed.",
    items: [{ slug: "jumbo-prawn-platter", quantity: 1, variant: "1 kg" }] },
];

export { cust };

// ---------------------------------------------------------------------------
// Website content
// ---------------------------------------------------------------------------
const gal = (file: string) => `${IMG}/gallery/${file}.jpg`;

export const WEBSITE_CONFIG = {
  announcement: {
    enabled: true,
    text: "Pink Hour hi-tea, 4:15 – 5:45 pm: the full buffet at a special rate. Seats are limited",
    linkLabel: "Reserve",
    linkHref: `${BASE}/reservation`,
  },
  navigation: { items: NAV, showCart: true, sticky: true, tone: "dark" },
  footer: {
    tagline: "One Buffet. Many Worlds. Pakistani, Continental, Pan-Asian and Middle Eastern cuisine under one roof in Lahore.",
    columns: [
      { title: "Explore", links: [
        { label: "Menu", href: `${BASE}/menu`, enabled: true },
        { label: "The buffet", href: `${BASE}/about` },
        { label: "Reservations", href: `${BASE}/reservation`, enabled: true },
        { label: "Reviews", href: `${BASE}/reviews`, enabled: true },
        { label: "Contact", href: `${BASE}/contact` },
      ] },
      { title: "Visit", links: [
        { label: "Villa Gulberg · 67 MM Alam Road", href: `${BASE}/locations` },
        { label: "Villa Lake City · Canal Commercial", href: `${BASE}/locations` },
      ] },
    ],
    legalNote: "Buffet prices are per head and exclude taxes. Children aged 3–7 dine at half price.",
  },
  ordering: { defaultOrderType: "delivery", allowGuestCheckout: true, showPrepTime: true, ctaLabel: "Order online" },
  contact: { email: RESTAURANT.email, showWhatsapp: true },
  social: { instagram: RESTAURANT.social.instagram, facebook: RESTAURANT.social.facebook },
};

/** The six live stations and cuisines, shared by the home and about pages. */
const EXPERIENCE = [
  { icon: "sparkles", title: "International cuisines", description: "Pakistani, Continental, Pan-Asian and Middle Eastern kitchens, all at one buffet." },
  { icon: "flame", title: "Live cooking stations", description: "Chefs cook to order in front of you, from the tandoor and karahi to hot pot and pasta." },
  { icon: "utensils", title: "Premium seafood & sushi", description: "Sushi rolled at the station, with prawns and fish grilled fresh through each seating." },
  { icon: "beef", title: "BBQ & grills", description: "Tikka, malai boti and seekh kebab straight off the charcoal." },
  { icon: "cake", title: "The dessert counter", description: "Kunafa, cakes, pastries and desi sweets, with a kids' corner beside it." },
  { icon: "chef-hat", title: "Pakistani favourites", description: "Karahi, qeema, biryani and butter chicken, cooked the Lahori way." },
];

export const HOME_SECTIONS = [
  {
    type: "hero", enabled: true, eyebrow: "Villa · The Grand Buffet · Lahore",
    title: "One buffet. Many worlds.",
    subtitle: "Four cuisines, live cooking stations and a dessert counter that goes on and on — served in elegant dining halls in Gulberg and Lake City.",
    image: { url: `${IMG}/hero.jpg`, alt: "The buffet line at Villa The Grand Buffet" },
    alignment: "left", overlay: 0.55, height: "full",
    primaryCta: { label: "Explore Menu", href: `${BASE}/menu`, style: "primary" },
    secondaryCta: { label: "Book a Table", href: `${BASE}/reservation`, style: "outline" },
    highlights: ["Live BBQ, tandoor & sushi", "90-minute seatings", "Gulberg · Lake City"],
  },
  { type: "why_choose_us", enabled: true, title: "The signature buffet experience", items: EXPERIENCE },
  { type: "menu_categories", enabled: true, title: "Villa at home", subtitle: "Signature dishes from every station, for delivery, takeaway or à la carte.", limit: 8, showImages: true },
  {
    type: "featured_items", enabled: true, title: "Signature dishes", subtitle: "The plates guests return to the buffet for, again and again.",
    itemSlugs: ["villa-grand-bbq-platter", "butter-chicken", "villa-sushi-boat", "garlic-butter-prawns", "lamb-mandi", "petit-four-box"],
    limit: 6, layout: "grid", cta: { label: "Explore the full menu", href: `${BASE}/menu`, style: "outline" },
  },
  {
    type: "about", enabled: true, eyebrow: "The buffet", title: "A house with the whole world at the table",
    body: "Villa is named for the idea of a house — one home where the world's kitchens meet. Choose a lunch, hi-tea or dinner seating, take your table and spend ninety minutes moving between the stations: charcoal BBQ and tandoor, sushi and hot pot, Continental plates, Arabic grills, Lahori karahi and a dessert counter the children always find first.",
    image: { url: `${IMG}/about.jpg`, alt: "A chef cooking over the flame at a live station" }, imagePosition: "right",
    stats: [
      { value: "4", label: "World cuisines" }, { value: "6", label: "Live stations" },
      { value: "90", label: "Minutes per seating" }, { value: "2", label: "Venues in Lahore" },
    ],
    cta: { label: "Discover the buffet", href: `${BASE}/about`, style: "outline" },
  },
  {
    type: "gallery", enabled: true, title: "The dining halls", subtitle: "Warm light, long family tables and room for every celebration.",
    images: [
      { url: gal("dining-hall"), alt: "The main dining hall" },
      { url: gal("family-table"), alt: "A family table filled with dishes from the buffet" },
      { url: gal("plating"), alt: "Plating at the Continental station" },
      { url: gal("grand-room"), alt: "The evening dining room" },
      { url: gal("chef"), alt: "One of our station chefs" },
      { url: gal("from-above"), alt: "The dining hall from above" },
    ],
    columns: 3,
  },
  { type: "locations", enabled: true, title: "Two venues in Lahore", subtitle: "Gulberg on MM Alam Road and Lake City on Canal Commercial, open every day for lunch, hi-tea and dinner.", showMap: true, limit: 4 },
  {
    type: "reservation_cta", enabled: true, title: "Reserve your seating",
    subtitle: "Lunch and hi-tea from 12:45 pm, dinner from 7:45 pm. Weekend seatings fill up early — book yours in a minute.",
    image: { url: gal("dining-hall"), alt: "The dining hall at Villa" }, phoneLabel: "Or call reservations",
    cta: { label: "Book a Table", href: `${BASE}/reservation`, style: "primary" },
  },
];

export const ABOUT_SECTIONS = [
  {
    type: "hero", enabled: true, eyebrow: "The buffet", title: "One house. Every kitchen.",
    subtitle: "How a Villa seating works, from the first plate to the dessert counter.",
    image: { url: `${IMG}/about.jpg`, alt: "A live cooking station at Villa" }, height: "sm", alignment: "center",
  },
  {
    type: "rich_text", enabled: true, title: "How a seating works",
    body: "Every seating is ninety minutes. Lunch and hi-tea run from 12:45 pm in three seatings, with an early-evening hi-tea at 6:00 pm, and dinner seatings start at 7:45 pm and 9:30 pm. Book ahead, arrive a few minutes early and your table will be ready.\n\nThe buffet is priced per head and taxes are added at the table. Children aged three to seven dine at half price; younger children dine free. For birthdays, corporate lunches and larger groups, ask about our private hall.",
    width: "narrow",
  },
  { type: "why_choose_us", enabled: true, title: "Around the stations", items: EXPERIENCE },
  {
    type: "gallery", enabled: true, title: "Inside Villa",
    images: [{ url: gal("chef"), alt: "Station chef" }, { url: gal("plating"), alt: "Plating" }, { url: gal("grand-room"), alt: "The dining room" }],
    columns: 3,
  },
  { type: "cta", enabled: true, title: "Save your seat at the table", tone: "neutral", cta: { label: "Book a Table", href: `${BASE}/reservation`, style: "primary" } },
];

export const CONTACT_SECTIONS = [
  { type: "hero", enabled: true, eyebrow: "Contact", title: "Speak to Villa", subtitle: "Reservations, private events and delivery orders.", height: "sm", alignment: "center" },
  { type: "contact", enabled: true, title: "Get in touch", showForm: true },
  { type: "locations", enabled: true, title: "Our venues", showMap: true },
  { type: "cta", enabled: true, title: "Ready to dine?", tone: "primary", cta: { label: "Book a Table", href: `${BASE}/reservation`, style: "primary" } },
];

/**
 * Functional pages (menu, reservation, reviews, locations) are website pages too: `page_content` marks where the
 * built-in body (menu list, booking form, reviews, location cards) sits and overrides its heading.
 */
export const MENU_SECTIONS = [
  {
    type: "page_content", enabled: true, title: "Villa at home",
    subtitle: "Signature dishes from every buffet station, for delivery, takeaway or à la carte.",
  },
  {
    type: "cta", enabled: true, title: "Prefer the full buffet?",
    subtitle: "Four cuisines and six live stations, served in ninety-minute seatings at both venues.",
    tone: "neutral", cta: { label: "Book a Table", href: `${BASE}/reservation`, style: "primary" },
    secondaryCta: { label: "How the buffet works", href: `${BASE}/about`, style: "outline" },
  },
];

export const RESERVATION_SECTIONS = [
  {
    type: "page_content", enabled: true, title: "Reserve your seating",
    subtitle: "Choose your venue, date and time. We confirm every booking by phone or email.",
  },
  {
    type: "why_choose_us", enabled: true, title: "Before you visit",
    items: [
      { icon: "clock", title: "90-minute seatings", description: "Lunch and hi-tea from 12:45 pm, evening hi-tea at 6:00 pm, dinner at 7:45 and 9:30 pm." },
      { icon: "users", title: "Families & groups", description: "Family tables for ten and a private hall for up to thirty guests." },
      { icon: "heart", title: "Children dine for less", description: "Ages 3–7 dine at half price, and the kids' corner keeps them busy." },
    ],
  },
];

export const REVIEWS_SECTIONS = [
  { type: "page_content", enabled: true, title: "Guest reviews", subtitle: "What diners say about Villa." },
  {
    type: "cta", enabled: true, title: "Taste it for yourself",
    tone: "primary", cta: { label: "Book a Table", href: `${BASE}/reservation`, style: "primary" },
  },
];

export const LOCATIONS_SECTIONS = [
  {
    type: "page_content", enabled: true, title: "Our venues",
    subtitle: "Villa Gulberg and Villa Lake City, open every day for lunch, hi-tea and dinner.",
  },
  { type: "contact", enabled: true, title: "Planning an event?", subtitle: "Birthdays, corporate lunches and family gatherings: call either venue.", showForm: false },
  {
    type: "cta", enabled: true, title: "Ready to dine?", tone: "neutral",
    cta: { label: "Book a Table", href: `${BASE}/reservation`, style: "primary" },
    secondaryCta: { label: "Explore Menu", href: `${BASE}/menu`, style: "outline" },
  },
];

/** [public url, file name, purpose, width, height] for the media library table. */
export const MEDIA: [string, string, string, number, number][] = [
  [`${IMG}/logo.svg`, "villa-logo.svg", "logo", 320, 96],
  [`${IMG}/cover.jpg`, "villa-cover.jpg", "cover", 1920, 1080],
  [`${IMG}/hero.jpg`, "villa-hero.jpg", "hero", 1920, 1080],
  [`${IMG}/about.jpg`, "villa-about.jpg", "website", 1920, 1080],
  ...["dining-hall", "grand-room", "plating", "family-table", "from-above", "chef"].map(
    (name): [string, string, string, number, number] => [gal(name), `villa-${name}.jpg`, "gallery", 1600, 1067],
  ),
];
