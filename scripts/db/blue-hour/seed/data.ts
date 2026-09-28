/**
 * Blue Hour Coffee — specialty coffee & bakery. Complete demo tenant (navy + white theme), inserted through the
 * real schema by ./seed.ts. Images live in ../images and are copied to /public/images/blue-hour by the seed.
 */

/** Deterministic, valid v4-shaped uuids: group = kind of row, n = ordinal. Prefix b1e0 is this tenant's own. */
const uid = (group: number, n: number): string =>
  `b1e0${group.toString(16).padStart(4, "0")}-bbbb-4bbb-8bbb-${n.toString().padStart(12, "0")}`;

export const IDS = {
  restaurant: uid(1, 1),
  locationGulberg: uid(2, 1),
  locationDha: uid(2, 2),
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
  zoneDha: uid(5, 3),
  zoneCantt: uid(5, 4),
  couponWelcome: uid(6, 1),
  couponMorning: uid(6, 2),
  couponFreeDelivery: uid(6, 3),
  couponExpired: uid(6, 4),
  memberOwner: uid(7, 1),
  memberAdmin: uid(7, 2),
  memberManager: uid(7, 3),
  memberBarista: uid(7, 4),
  userOwner: uid(8, 1),
  userAdmin: uid(8, 2),
  userManager: uid(8, 3),
  userBarista: uid(8, 4),
} as const;

export const SLUG = "blue-hour";
const BASE = `/r/${SLUG}`;
const IMG = `/images/${SLUG}`;

export const RESTAURANT = {
  name: "Blue Hour Coffee",
  slug: SLUG,
  legalName: "Blue Hour Coffee Co. (Pvt) Ltd",
  tagline: "Specialty Coffee & Bakery",
  city: "Lahore",
  shortDescription: "Small-batch roasted coffee, a morning bakery and an all-day breakfast menu — specialty coffee in Lahore.",
  description:
    "Blue Hour is a specialty coffee bar and bakery. We roast in small batches every Tuesday and Friday, pull every shot on a dialled-in grinder, and laminate our croissant dough by hand the night before. Two cafés in Lahore, open from early morning until the lights go blue.",
  cuisines: ["Coffee", "Cafe", "Bakery", "Breakfast"],
  phone: "+92 42 3578 2201",
  whatsapp: "+92 333 4782 201",
  email: "hello@bluehour.coffee",
  websiteUrl: "https://bluehour.coffee",
  currency: "PKR",
  currencySymbol: "Rs",
  timezone: "Asia/Karachi",
  social: {
    instagram: "https://instagram.com/bluehour.coffee",
    facebook: "https://facebook.com/bluehour.coffee",
    tiktok: "https://tiktok.com/@bluehour.coffee",
  },
  logo: `${IMG}/logo.svg`,
  cover: `${IMG}/cover.jpg`,
};

export const SETTINGS = {
  tax: { enabled: true, rate: 16, included: false, applyOnDeliveryFee: false, label: "Sales tax" },
  serviceFee: { enabled: false, rate: 0, orderTypes: ["dine_in"] },
  ordering: {
    onlineOrderingEnabled: true,
    minimumOrderAmount: 600,
    maxAdvanceDays: 3,
    allowScheduledOrders: true,
    preparationTimeMinutes: 10,
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
    maxGuests: 8,
    autoConfirm: true,
    maxAdvanceDays: 21,
    defaultDurationMinutes: 75,
    tables: [
      { name: "Window 1", seats: 2 },
      { name: "Window 2", seats: 2 },
      { name: "Bar", seats: 4 },
      { name: "T1", seats: 4 },
      { name: "T2", seats: 4 },
      { name: "Terrace", seats: 6 },
      { name: "Long table", seats: 8 },
    ],
  },
  delivery: { enabled: true, defaultEtaMinutes: 30, freeDeliveryOver: null, trackingEnabled: true },
  loyalty: { enabled: false, pointsPerCurrencyUnit: 1, redeemRate: 0.01 },
  receipt: { footerNote: "Thanks for stopping by Blue Hour. Follow @bluehour.coffee", showTaxNumber: false },
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

const DAY = [{ open: "07:30", close: "23:00" }];
const WEEKEND = [{ open: "08:00", close: "00:00" }];
export const HOURS_GULBERG = { mon: DAY, tue: DAY, wed: DAY, thu: DAY, fri: WEEKEND, sat: WEEKEND, sun: [{ open: "08:00", close: "23:00" }] };
const DHA_DAY = [{ open: "08:00", close: "22:30" }];
export const HOURS_DHA = { mon: DHA_DAY, tue: DHA_DAY, wed: DHA_DAY, thu: DHA_DAY, fri: [{ open: "08:00", close: "23:30" }], sat: [{ open: "08:30", close: "23:30" }], sun: [{ open: "08:30", close: "22:30" }] };

export const LOCATIONS = [
  {
    id: IDS.locationGulberg, name: "MM Alam Road", slug: "mm-alam-road", primary: true,
    line1: "71-C, MM Alam Road, Gulberg III", area: "Gulberg III", city: "Lahore", state: "Punjab",
    postalCode: "54660", phone: "+92 42 3578 2201", latitude: 31.5102, longitude: 74.3494, hours: HOURS_GULBERG,
    settings: { roastery: true, terrace: true, parking: false },
  },
  {
    id: IDS.locationDha, name: "DHA Phase 6", slug: "dha-phase-6", primary: false,
    line1: "Plot 12, Main Boulevard, CCA", area: "DHA Phase 6", city: "Lahore", state: "Punjab",
    postalCode: "54792", phone: "+92 42 3578 2202", latitude: 31.4697, longitude: 74.4541, hours: HOURS_DHA,
    settings: { roastery: false, terrace: true, parking: true },
  },
];

/**
 * Navy + white. Accent is a cornflower blue that reads on both grounds (3.5:1 on white for icons/stars, 4.9:1 on
 * the night navy); badge text on the accent uses the night navy (4.9:1).
 */
export const THEME = {
  name: "Navy & Porcelain",
  primary: "#14305E",
  primaryForeground: "#FFFFFF",
  secondary: "#0E2244",
  accent: "#4C86F0",
  background: "#FFFFFF",
  surface: "#FFFFFF",
  foreground: "#0F1B2E",
  muted: "#5A6680",
  border: "#E2E8F1",
  font: "DM Serif Display",
  bodyFont: "DM Sans",
  radius: "lg",
  dark: false,
  surfaceMuted: "#F3F6FB",
  surfaceDark: "#0B1B36",
  foregroundOnDark: "#F4F7FC",
  accentForeground: "#0B1B36",
};

export const NAV = [
  { label: "Home", href: BASE, enabled: true },
  { label: "Menu", href: `${BASE}/menu`, enabled: true },
  { label: "Our Story", href: `${BASE}/about`, enabled: true },
  { label: "Book a Table", href: `${BASE}/reservation`, enabled: true },
  { label: "Reviews", href: `${BASE}/reviews`, enabled: true },
  { label: "Cafés", href: `${BASE}/locations`, enabled: true },
];

export const TEAM = [
  { id: IDS.userOwner, member: IDS.memberOwner, email: "owner@bluehour.coffee", name: "Sana Rehman", role: "owner", password: "BlueHour#1", phone: "+92 300 4441001" },
  { id: IDS.userAdmin, member: IDS.memberAdmin, email: "admin@bluehour.coffee", name: "Ali Raza", role: "admin", password: "BlueHour#2", phone: "+92 300 4441002" },
  { id: IDS.userManager, member: IDS.memberManager, email: "manager@bluehour.coffee", name: "Zoya Malik", role: "manager", password: "BlueHour#3", phone: "+92 300 4441003" },
  { id: IDS.userBarista, member: IDS.memberBarista, email: "barista@bluehour.coffee", name: "Hamza Tariq", role: "staff", password: "BlueHour#4", phone: "+92 300 4441004" },
];
/** Staff name written on seeded order status changes. */
export const SHIFT_LEAD = "Zoya Malik";

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------
export interface SeedCategory { slug: string; name: string; description: string; image: string; icon: string; featured?: boolean }

const m = (file: string) => `${IMG}/menu/${file}.jpg`;

export const CATEGORIES: SeedCategory[] = [
  { slug: "espresso-bar", name: "Espresso Bar", description: "Our house blend, pulled to order on a two-group La Marzocco.", image: m("cappuccino"), icon: "coffee", featured: true },
  { slug: "cold-coffee", name: "Cold Coffee", description: "Eighteen-hour cold brew and iced espresso drinks.", image: m("cold-brew"), icon: "cup-soda", featured: true },
  { slug: "specialty", name: "Specialty & Slow Bar", description: "Single origins, brewed by hand.", image: m("pour-over"), icon: "sparkles" },
  { slug: "tea-matcha", name: "Tea, Matcha & Chocolate", description: "Loose-leaf teas, stone-ground matcha and proper hot chocolate.", image: m("matcha-latte"), icon: "leaf" },
  { slug: "bakery", name: "Bakery", description: "Laminated overnight, baked every morning from 6 am.", image: m("almond-croissant"), icon: "croissant", featured: true },
  { slug: "desserts", name: "Cakes & Desserts", description: "Something sweet for the second cup.", image: m("tiramisu"), icon: "cake" },
  { slug: "breakfast", name: "All-Day Breakfast", description: "Eggs, toast and griddle plates, served until close.", image: m("french-toast"), icon: "utensils", featured: true },
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

/** Cup sizes: small / regular / large, absolute prices. */
const sizes = (small: string, regular: string, large: string): SeedVariant[] => [
  { name: "Small · 8 oz", price: small },
  { name: "Regular · 12 oz", price: regular, isDefault: true },
  { name: "Large · 16 oz", price: large },
];
const MILK: SeedAddonGroup = {
  name: "Milk", isRequired: true, minSelect: 1, maxSelect: 1,
  addons: [
    { name: "Whole milk", price: "0.00", isDefault: true },
    { name: "Oat milk", price: "180.00" },
    { name: "Almond milk", price: "180.00" },
    { name: "Lactose-free", price: "120.00" },
  ],
};
const EXTRAS: SeedAddonGroup = {
  name: "Make it yours", maxSelect: 4,
  addons: [
    { name: "Extra shot", price: "150.00", maxQuantity: 2 },
    { name: "Decaf", price: "0.00" },
    { name: "Vanilla syrup", price: "120.00" },
    { name: "Salted caramel syrup", price: "120.00" },
    { name: "Hazelnut syrup", price: "120.00" },
  ],
};
const SWEETNESS: SeedAddonGroup = {
  name: "Sweetness", isRequired: true, minSelect: 1, maxSelect: 1,
  addons: [{ name: "Regular", price: "0.00", isDefault: true }, { name: "Less sweet", price: "0.00" }, { name: "Unsweetened", price: "0.00" }],
};
const BREAKFAST_EXTRAS: SeedAddonGroup = {
  name: "Add to your plate", maxSelect: 4,
  addons: [
    { name: "Extra egg", price: "150.00", maxQuantity: 2 },
    { name: "Smoked chicken", price: "320.00" },
    { name: "Half avocado", price: "350.00" },
    { name: "Sautéed mushrooms", price: "220.00" },
  ],
};
const WARM: SeedAddonGroup = {
  name: "Serve it", maxSelect: 1,
  addons: [{ name: "Warmed", price: "0.00" }, { name: "With clotted cream", price: "180.00" }],
};

export const ITEMS: SeedItem[] = [
  // ── Espresso Bar ─────────────────────────────────────────────────────────
  {
    name: "Espresso", slug: "espresso", category: "espresso-bar", image: m("espresso"),
    price: "450.00", prepTime: 3,
    description: "A double shot of our Blue Hour house blend — Brazil Cerrado and Ethiopia Guji — with notes of cocoa, red berry and brown sugar.",
    dietaryTags: ["vegan"],
    variants: [{ name: "Double", price: "450.00", isDefault: true }, { name: "Triple", price: "590.00" }],
  },
  {
    name: "Americano", slug: "americano", category: "espresso-bar", image: m("americano"),
    price: "550.00", prepTime: 3,
    description: "Two shots over hot water for a long, clean cup. Ask for it with a splash of milk.",
    dietaryTags: ["vegan"],
    variants: sizes("490.00", "550.00", "650.00"),
    addonGroups: [EXTRAS],
  },
  {
    name: "Cortado", slug: "cortado", category: "espresso-bar", image: m("cortado"),
    price: "590.00", prepTime: 4,
    description: "Equal parts espresso and silky steamed milk in a 4.5 oz glass. Short, strong and balanced.",
    dietaryTags: ["vegetarian"], allergens: ["dairy"],
    addonGroups: [MILK],
  },
  {
    name: "Flat White", slug: "flat-white", category: "espresso-bar", image: m("flat-white"),
    price: "690.00", featured: true, prepTime: 4,
    shortDescription: "Double ristretto, thin microfoam",
    description: "A double ristretto under a thin layer of velvety microfoam — the barista's order, and ours.",
    dietaryTags: ["vegetarian"], allergens: ["dairy"],
    addonGroups: [MILK, EXTRAS],
  },
  {
    name: "Cappuccino", slug: "cappuccino", category: "espresso-bar", image: m("cappuccino"),
    price: "720.00", prepTime: 4,
    description: "Espresso with steamed milk and a deep cap of foam, finished with latte art.",
    dietaryTags: ["vegetarian"], allergens: ["dairy"],
    variants: sizes("650.00", "720.00", "820.00"),
    addonGroups: [MILK, EXTRAS],
  },
  {
    name: "Café Latte", slug: "cafe-latte", category: "espresso-bar", image: m("latte"),
    price: "750.00", prepTime: 4,
    description: "Espresso and plenty of steamed milk for a soft, mellow cup. Add a syrup if you like it sweeter.",
    dietaryTags: ["vegetarian"], allergens: ["dairy"],
    variants: sizes("680.00", "750.00", "850.00"),
    addonGroups: [MILK, EXTRAS],
  },
  {
    name: "Spanish Latte", slug: "spanish-latte", category: "espresso-bar", image: m("spanish-latte"),
    price: "820.00", featured: true, prepTime: 4,
    shortDescription: "Espresso, milk and condensed milk",
    description: "Our most-ordered drink: espresso and steamed milk sweetened with condensed milk, rich and caramel-smooth.",
    dietaryTags: ["vegetarian"], allergens: ["dairy"],
    variants: sizes("750.00", "820.00", "920.00"),
    addonGroups: [MILK, EXTRAS],
  },

  // ── Cold Coffee ──────────────────────────────────────────────────────────
  {
    name: "Iced Latte", slug: "iced-latte", category: "cold-coffee", image: m("iced-latte"),
    price: "790.00", prepTime: 3,
    description: "Double espresso poured over cold milk and ice.",
    dietaryTags: ["vegetarian"], allergens: ["dairy"],
    variants: [{ name: "Regular · 16 oz", price: "790.00", isDefault: true }, { name: "Large · 20 oz", price: "890.00" }],
    addonGroups: [MILK, EXTRAS],
  },
  {
    name: "18-Hour Cold Brew", slug: "cold-brew", category: "cold-coffee", image: m("cold-brew"),
    price: "720.00", featured: true, prepTime: 2,
    shortDescription: "Steeped overnight, served over ice",
    description: "Single-origin Colombia steeped cold for eighteen hours. Smooth, chocolatey and naturally low in acidity. Add a splash of milk or keep it black.",
    dietaryTags: ["vegan", "gluten-free"],
    variants: [{ name: "Regular · 16 oz", price: "720.00", isDefault: true }, { name: "1 litre bottle", price: "2200.00" }],
  },
  {
    name: "Iced Spanish Latte", slug: "iced-spanish-latte", category: "cold-coffee", image: m("iced-spanish-latte"),
    price: "850.00", featured: true, prepTime: 3,
    description: "The Spanish latte over ice — espresso, cold milk and condensed milk, shaken until frothy.",
    dietaryTags: ["vegetarian"], allergens: ["dairy"],
    variants: [{ name: "Regular · 16 oz", price: "850.00", isDefault: true }, { name: "Large · 20 oz", price: "950.00" }],
    addonGroups: [MILK, SWEETNESS],
  },
  {
    name: "Iced Vanilla Oat Latte", slug: "iced-vanilla-oat-latte", category: "cold-coffee", image: m("iced-vanilla-latte"),
    price: "920.00", prepTime: 3,
    description: "Espresso, oat milk and house Madagascar vanilla syrup over ice. Dairy-free by default.",
    dietaryTags: ["vegan"], allergens: ["gluten"],
    addonGroups: [SWEETNESS],
  },
  {
    name: "Espresso Tonic", slug: "espresso-tonic", category: "cold-coffee", image: m("espresso-tonic"),
    price: "780.00", prepTime: 3,
    description: "A bright Ethiopian espresso floated over tonic water, ice and a slice of lime. Bitter, fizzy, refreshing.",
    dietaryTags: ["vegan", "gluten-free"],
  },

  // ── Specialty & Slow Bar ─────────────────────────────────────────────────
  {
    name: "V60 Pour-Over", slug: "v60-pour-over", category: "specialty", image: m("pour-over"),
    price: "950.00", featured: true, prepTime: 6,
    shortDescription: "Rotating single origin, brewed by hand",
    description: "A clean, tea-like cup brewed by hand on the slow bar. Ask your barista about this week's single origins.",
    dietaryTags: ["vegan", "gluten-free"],
    variants: [
      { name: "Ethiopia Guji · floral, peach", price: "950.00", isDefault: true },
      { name: "Colombia Huila · caramel, red apple", price: "950.00" },
      { name: "Kenya Nyeri · blackcurrant, grapefruit", price: "1100.00" },
    ],
  },
  {
    name: "French Press for Two", slug: "french-press-for-two", category: "specialty", image: m("french-press"),
    price: "1250.00", prepTime: 6,
    description: "A full-bodied pot of our house blend, steeped four minutes and served with warm milk on the side.",
    dietaryTags: ["vegan", "gluten-free"],
  },
  {
    name: "Coffee Tasting Flight", slug: "coffee-tasting-flight", category: "specialty", image: m("tasting-flight"),
    price: "1650.00", prepTime: 10,
    description: "Three single origins side by side — espresso, pour-over and a milk drink — with tasting notes from the roaster.",
    dietaryTags: ["vegetarian"], allergens: ["dairy"],
  },

  // ── Tea, Matcha & Chocolate ──────────────────────────────────────────────
  {
    name: "Matcha Latte", slug: "matcha-latte", category: "tea-matcha", image: m("matcha-latte"),
    price: "890.00", featured: true, prepTime: 4,
    description: "Stone-ground Uji matcha whisked to order and topped with steamed milk. Earthy, creamy, lightly sweet.",
    dietaryTags: ["vegetarian", "gluten-free"], allergens: ["dairy"],
    variants: [{ name: "Hot", price: "890.00", isDefault: true }, { name: "Iced", price: "940.00" }],
    addonGroups: [MILK, SWEETNESS],
  },
  {
    name: "Ceremonial Matcha", slug: "ceremonial-matcha", category: "tea-matcha", image: m("ceremonial-matcha"),
    price: "990.00", prepTime: 5,
    description: "Ceremonial-grade matcha whisked with water only — bright, grassy and vivid green.",
    dietaryTags: ["vegan", "gluten-free"],
  },
  {
    name: "Masala Chai Latte", slug: "masala-chai-latte", category: "tea-matcha", image: m("chai-latte"),
    price: "650.00", prepTime: 5,
    description: "Assam tea simmered with our own blend of cardamom, clove, ginger and black pepper, then steamed with milk.",
    dietaryTags: ["vegetarian", "gluten-free"], allergens: ["dairy"],
    addonGroups: [MILK, SWEETNESS],
  },
  {
    name: "Loose-Leaf Tea Pot", slug: "loose-leaf-tea-pot", category: "tea-matcha", image: m("loose-leaf-tea"),
    price: "590.00", prepTime: 5,
    description: "A pot for one, brewed to the leaf's own time and temperature.",
    dietaryTags: ["vegan", "gluten-free"],
    variants: [
      { name: "English breakfast", price: "590.00", isDefault: true },
      { name: "Earl grey", price: "590.00" },
      { name: "Jasmine green", price: "650.00" },
      { name: "Chamomile & honey", price: "620.00" },
    ],
  },
  {
    name: "Dark Hot Chocolate", slug: "dark-hot-chocolate", category: "tea-matcha", image: m("hot-chocolate"),
    price: "790.00", prepTime: 4,
    description: "70% Belgian dark chocolate melted into steamed milk, thick and not too sweet.",
    dietaryTags: ["vegetarian", "gluten-free"], allergens: ["dairy"],
    addonGroups: [MILK],
  },

  // ── Bakery ───────────────────────────────────────────────────────────────
  {
    name: "Butter Croissant", slug: "butter-croissant", category: "bakery", image: m("butter-croissant"),
    price: "490.00", featured: true, prepTime: 2,
    description: "Laminated with French butter over three days. Shattering outside, soft and honeycombed within.",
    dietaryTags: ["vegetarian"], allergens: ["gluten", "dairy", "eggs"],
    addonGroups: [WARM],
  },
  {
    name: "Almond Croissant", slug: "almond-croissant", category: "bakery", image: m("almond-croissant"),
    price: "690.00", prepTime: 3,
    description: "Twice-baked with almond frangipane and toasted flaked almonds, finished with icing sugar.",
    dietaryTags: ["vegetarian"], allergens: ["gluten", "dairy", "eggs", "nuts"],
    addonGroups: [WARM],
  },
  {
    name: "Cardamom Cinnamon Bun", slug: "cardamom-cinnamon-bun", category: "bakery", image: m("cinnamon-roll"),
    price: "590.00", prepTime: 2,
    description: "A knotted Swedish-style bun with cinnamon, crushed cardamom and pearl sugar.",
    dietaryTags: ["vegetarian"], allergens: ["gluten", "dairy", "eggs"],
    addonGroups: [WARM],
  },
  {
    name: "Blueberry Crumb Muffin", slug: "blueberry-crumb-muffin", category: "bakery", image: m("blueberry-muffin"),
    price: "520.00", prepTime: 2,
    description: "Buttermilk muffin packed with blueberries under a brown-sugar crumb.",
    dietaryTags: ["vegetarian"], allergens: ["gluten", "dairy", "eggs"],
  },
  {
    name: "Sea Salt Chocolate Chip Cookie", slug: "sea-salt-cookie", category: "bakery", image: m("cookie"),
    price: "390.00", prepTime: 2,
    description: "Brown-butter dough, dark chocolate chunks and flaky sea salt. Crisp edges, gooey middle.",
    dietaryTags: ["vegetarian"], allergens: ["gluten", "dairy", "eggs"],
    variants: [{ name: "Single", price: "390.00", isDefault: true }, { name: "Box of 4", price: "1450.00" }],
  },

  // ── Cakes & Desserts ─────────────────────────────────────────────────────
  {
    name: "Blueberry Baked Cheesecake", slug: "blueberry-cheesecake", category: "desserts", image: m("cheesecake"),
    price: "890.00", featured: true, prepTime: 2,
    description: "New York-style baked cheesecake on a digestive base, topped with a slow-cooked blueberry compote.",
    dietaryTags: ["vegetarian"], allergens: ["gluten", "dairy", "eggs"],
  },
  {
    name: "Espresso Tiramisu", slug: "espresso-tiramisu", category: "desserts", image: m("tiramisu"),
    price: "950.00", prepTime: 2,
    description: "Savoiardi soaked in our house espresso, layered with mascarpone cream and dusted with cocoa.",
    dietaryTags: ["vegetarian"], allergens: ["gluten", "dairy", "eggs"],
  },
  {
    name: "Fudge Brownie", slug: "fudge-brownie", category: "desserts", image: m("brownie"),
    price: "550.00", prepTime: 2,
    description: "Dense, fudgy and very chocolatey, with a crackled top.",
    dietaryTags: ["vegetarian"], allergens: ["gluten", "dairy", "eggs"],
    addonGroups: [WARM],
  },
  {
    name: "Chocolate Ganache Cake", slug: "chocolate-ganache-cake", category: "desserts", image: m("chocolate-cake"),
    price: "850.00", prepTime: 2,
    description: "Three layers of dark chocolate sponge with whipped ganache. Whole cakes to order with 24 hours' notice.",
    dietaryTags: ["vegetarian"], allergens: ["gluten", "dairy", "eggs"],
    variants: [{ name: "Slice", price: "850.00", isDefault: true }, { name: "Whole cake · serves 8", price: "5900.00" }],
  },

  // ── All-Day Breakfast ────────────────────────────────────────────────────
  {
    name: "Chilli Egg on Sourdough", slug: "chilli-egg-sourdough", category: "breakfast", image: m("egg-sourdough"),
    price: "1150.00", prepTime: 12, spiceLevel: 1,
    description: "A crispy-edged fried egg on toasted sourdough with smashed avocado, chilli crisp and spring onion.",
    dietaryTags: ["vegetarian"], allergens: ["gluten", "eggs"],
    addonGroups: [BREAKFAST_EXTRAS],
  },
  {
    name: "Avocado & Soft Egg on Rye", slug: "avocado-soft-egg-rye", category: "breakfast", image: m("avocado-rye"),
    price: "1290.00", featured: true, prepTime: 12,
    description: "Seeded rye with sliced avocado, a jammy six-minute egg, lemon, olive oil and dukkah.",
    dietaryTags: ["vegetarian"], allergens: ["gluten", "eggs", "sesame", "nuts"],
    addonGroups: [BREAKFAST_EXTRAS],
  },
  {
    name: "Brioche French Toast", slug: "brioche-french-toast", category: "breakfast", image: m("french-toast"),
    price: "1190.00", prepTime: 14,
    description: "Thick-cut brioche soaked in vanilla custard, caramelised in butter, with banana, blueberries and maple.",
    dietaryTags: ["vegetarian"], allergens: ["gluten", "dairy", "eggs"],
  },
  {
    name: "Buttermilk Pancake Stack", slug: "buttermilk-pancakes", category: "breakfast", image: m("pancakes"),
    price: "1090.00", prepTime: 14,
    description: "Three fluffy buttermilk pancakes with whipped butter, fresh fruit and warm maple syrup.",
    dietaryTags: ["vegetarian"], allergens: ["gluten", "dairy", "eggs"],
    variants: [{ name: "Stack of 3", price: "1090.00", isDefault: true }, { name: "Stack of 5", price: "1490.00" }],
  },
  {
    name: "Chicken Pesto Panini", slug: "chicken-pesto-panini", category: "breakfast", image: m("chicken-panini"),
    price: "1350.00", prepTime: 12,
    description: "Pressed focaccia with roast chicken, basil pesto, mozzarella and sun-dried tomato. Served with a side salad.",
    dietaryTags: ["halal"], allergens: ["gluten", "dairy", "nuts"],
  },
  {
    name: "Smoked Chicken Club", slug: "smoked-chicken-club", category: "breakfast", image: m("chicken-club"),
    price: "1450.00", prepTime: 12,
    description: "Toasted multigrain layered with smoked chicken, fried egg, cheddar, lettuce, tomato and chipotle mayo.",
    dietaryTags: ["halal"], allergens: ["gluten", "dairy", "eggs"],
  },
  {
    name: "Greek Yoghurt & Berry Parfait", slug: "yoghurt-berry-parfait", category: "breakfast", image: m("yoghurt-parfait"),
    price: "890.00", prepTime: 5, calories: 380,
    description: "Thick Greek yoghurt layered with house honey-almond granola, strawberries and berry compote.",
    dietaryTags: ["vegetarian"], allergens: ["dairy", "nuts", "gluten"],
  },
];

export const ZONES = [
  { id: IDS.zoneGulberg, locationId: IDS.locationGulberg, name: "Gulberg & MM Alam", description: "Delivered from our MM Alam Road café.",
    areas: ["Gulberg I", "Gulberg II", "Gulberg III", "MM Alam Road", "Main Market"], postalCodes: ["54660"], fee: "120.00", minOrder: "800.00", freeOver: "3000.00", etaMin: 20, etaMax: 30 },
  { id: IDS.zoneCentral, locationId: IDS.locationGulberg, name: "Model Town, Garden Town & Johar Town", areas: ["Model Town", "Garden Town", "Faisal Town", "Johar Town"], postalCodes: ["54700", "54782"], fee: "180.00", minOrder: "1200.00", freeOver: "4000.00", etaMin: 30, etaMax: 45 },
  { id: IDS.zoneDha, locationId: IDS.locationDha, name: "DHA Phases 1–6", description: "Delivered from our DHA Phase 6 café.", areas: ["DHA Phase 1", "DHA Phase 3", "DHA Phase 4", "DHA Phase 5", "DHA Phase 6"], postalCodes: ["54792"], fee: "120.00", minOrder: "800.00", freeOver: "3000.00", etaMin: 20, etaMax: 35 },
  { id: IDS.zoneCantt, locationId: IDS.locationDha, name: "Cantt & Askari", areas: ["Lahore Cantt", "Askari 10", "Askari 11", "Walton"], postalCodes: ["54810"], fee: "200.00", minOrder: "1500.00", freeOver: null, etaMin: 30, etaMax: 50 },
];

export const COUPONS = [
  { id: IDS.couponWelcome, code: "FIRSTCUP", description: "15% off your first order", type: "percentage", value: "15.00", minOrder: "1000.00", maxDiscount: "400.00", appliesTo: "order", usageLimit: 500, perCustomer: 1, startsAt: -30, endsAt: 150, active: true },
  { id: IDS.couponMorning, code: "BLUEHOUR200", description: "Rs 200 off orders above Rs 2,000", type: "fixed", value: "200.00", minOrder: "2000.00", maxDiscount: null, appliesTo: "order", usageLimit: null, perCustomer: 3, startsAt: -60, endsAt: 90, active: true },
  { id: IDS.couponFreeDelivery, code: "FREESHIP", description: "Free delivery on orders above Rs 1,500", type: "fixed", value: "200.00", minOrder: "1500.00", maxDiscount: null, appliesTo: "delivery_fee", usageLimit: 300, perCustomer: null, startsAt: -10, endsAt: 60, active: true },
  { id: IDS.couponExpired, code: "LAUNCH25", description: "25% launch week offer (expired)", type: "percentage", value: "25.00", minOrder: "800.00", maxDiscount: "500.00", appliesTo: "order", usageLimit: 200, perCustomer: 1, startsAt: -400, endsAt: -300, active: true },
];

// ---------------------------------------------------------------------------
// People, reviews, reservations, orders
// ---------------------------------------------------------------------------
const c = (n: number) => uid(9, n);
export const CUSTOMERS = [
  { id: c(1), name: "Hania Qureshi", phone: "+92 300 4123451", email: "hania.qureshi@example.com", account: false, address: { label: "Home", line1: "House 32, Block E", area: "Gulberg III", city: "Lahore", postalCode: "54660" } },
  { id: c(2), name: "Usman Sheikh", phone: "+92 321 4876543", email: "usman.sheikh@example.com", account: false, address: { label: "Office", line1: "Floor 6, Arfa Software Park", area: "Model Town", city: "Lahore", postalCode: "54700" } },
  { id: c(3), name: "Ayesha Khan", phone: "+92 333 4667788", email: "ayesha.khan@example.com", account: true, address: { label: "Home", line1: "House 118, Street 4", area: "DHA Phase 5", city: "Lahore", postalCode: "54792" } },
  { id: c(4), name: "Bilal Ahmad", phone: "+92 345 4778899", email: "bilal.ahmad@example.com", account: false, address: { label: "Home", line1: "House 9, Block K", area: "Johar Town", city: "Lahore", postalCode: "54782" } },
  { id: c(5), name: "Mahnoor Iqbal", phone: "+92 301 4455667", email: "mahnoor.iqbal@example.com", account: false, address: { label: "Home", line1: "House 27, Street 11", area: "Askari 10", city: "Lahore", postalCode: "54810" } },
  { id: c(6), name: "Raza Hussain", phone: "+92 302 4889900", email: "raza.hussain@example.com", account: false, address: { label: "Studio", line1: "Unit 3, Main Boulevard", area: "Gulberg II", city: "Lahore", postalCode: "54660" } },
  { id: c(7), name: "Fatima Noor", phone: "+92 311 4990011", email: "fatima.noor@example.com", account: true, address: { label: "Home", line1: "Flat 7B, Emporium Residences", area: "Johar Town", city: "Lahore", postalCode: "54782" } },
  { id: c(8), name: "Hassan Javed", phone: "+92 336 4334455", email: "hassan.javed@example.com", account: false, address: { label: "Home", line1: "House 64, Block Y", area: "DHA Phase 3", city: "Lahore", postalCode: "54792" } },
];
const cust = (n: number) => CUSTOMERS[n - 1]!;

export const REVIEWS = [
  { customer: 1, itemSlug: "spanish-latte", author: "Hania Qureshi", rating: 5, title: "The Spanish latte is dangerous", comment: "Perfectly balanced — sweet but you can still taste the coffee. I've had one every morning this week.", status: "approved", featured: true, daysAgo: 2 },
  { customer: 2, itemSlug: "v60-pour-over", author: "Usman Sheikh", rating: 5, title: "A proper slow bar", comment: "The Guji on V60 tasted like peach tea. The barista walked me through the origins without any snobbery.", status: "approved", featured: true, daysAgo: 4 },
  { customer: 3, itemSlug: "almond-croissant", author: "Ayesha Khan", rating: 5, title: "Best croissant in Lahore", comment: "Flaky, buttery layers and just enough frangipane. Get there before ten or they're gone.", status: "approved", featured: true, daysAgo: 7 },
  { customer: 4, itemSlug: "cold-brew", author: "Bilal Ahmad", rating: 4, title: "Smooth cold brew", comment: "Really smooth and chocolatey. The litre bottle lasts me three days. Wish the DHA branch opened a little earlier.", status: "approved", featured: false, daysAgo: 10 },
  { customer: 5, itemSlug: "avocado-soft-egg-rye", author: "Mahnoor Iqbal", rating: 5, title: "Brunch done right", comment: "Jammy egg, great rye and the dukkah makes it. Lovely bright room for a slow Sunday.", status: "approved", featured: false, daysAgo: 13 },
  { customer: 6, itemSlug: "flat-white", author: "Raza Hussain", rating: 5, title: "Consistent every single time", comment: "I work from the terrace most days. The flat white is the same great cup at 8 am and 6 pm.", status: "approved", featured: true, daysAgo: 17 },
  { customer: null, itemSlug: "blueberry-cheesecake", author: "Sara M.", rating: 4, title: "Great cheesecake", comment: "Creamy and not too sweet, and the compote is lovely. A bit pricey, but a treat.", status: "approved", featured: false, daysAgo: 21 },
  { customer: 7, itemSlug: "matcha-latte", author: "Fatima Noor", rating: 5, title: "Real matcha, finally", comment: "Vivid green, whisked properly and not a syrup bomb. The oat milk version is perfect.", status: "pending", featured: false, daysAgo: 1 },
  { customer: null, itemSlug: "iced-latte", author: "Anonymous", rating: 2, title: "Ice had melted", comment: "Arrived watery after a long delivery. Tastes great in the café though.", status: "rejected", featured: false, daysAgo: 26 },
];

export const RESERVATIONS = [
  { customer: 1, daysAhead: 1, time: "10:00", guests: 2, table: "Window 1", status: "confirmed", occasion: null, requests: "Window seat if possible." },
  { customer: 2, daysAhead: 2, time: "16:30", guests: 4, table: "T1", status: "confirmed", occasion: "Team catch-up", requests: "Need a table near a power socket." },
  { customer: 4, daysAhead: 3, time: "11:30", guests: 8, table: "Long table", status: "pending", occasion: "Birthday brunch", requests: "Candle on a slice of the chocolate cake, please." },
  { customer: 5, daysAhead: 5, time: "09:30", guests: 3, table: null, status: "pending", occasion: null, requests: "Terrace seating." },
  { customer: 3, daysAhead: -3, time: "12:00", guests: 4, table: "T2", status: "completed", occasion: null, requests: null },
  { customer: 6, daysAhead: -1, time: "18:00", guests: 6, table: "Terrace", status: "no_show", occasion: "Study group", requests: null },
];

export interface SeedOrder {
  customer: number;
  location: "gulberg" | "dha";
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
  { customer: 1, location: "gulberg", orderType: "delivery", status: "pending", hoursAgo: 0.2, zoneId: IDS.zoneGulberg, paymentMethod: "cash_on_delivery", paymentStatus: "pending", couponCode: "FIRSTCUP", notes: "Please ring the bell twice.",
    items: [{ slug: "spanish-latte", quantity: 2, variant: "Regular · 12 oz", addons: ["Oat milk"] }, { slug: "almond-croissant", quantity: 2, addons: ["Warmed"] }] },
  { customer: 2, location: "gulberg", orderType: "delivery", status: "confirmed", hoursAgo: 0.5, zoneId: IDS.zoneCentral, paymentMethod: "cash_on_delivery", paymentStatus: "pending",
    items: [{ slug: "cold-brew", quantity: 1, variant: "1 litre bottle" }, { slug: "iced-latte", quantity: 3, variant: "Regular · 16 oz", addons: ["Whole milk", "Extra shot"] }, { slug: "sea-salt-cookie", quantity: 1, variant: "Box of 4" }] },
  { customer: 3, location: "dha", orderType: "delivery", status: "preparing", hoursAgo: 0.8, zoneId: IDS.zoneDha, paymentMethod: "cash_on_delivery", paymentStatus: "pending", couponCode: "BLUEHOUR200",
    items: [{ slug: "avocado-soft-egg-rye", quantity: 2, addons: ["Extra egg"] }, { slug: "flat-white", quantity: 2, addons: ["Whole milk"] }, { slug: "blueberry-cheesecake", quantity: 1 }] },
  { customer: 4, location: "gulberg", orderType: "pickup", status: "ready", hoursAgo: 0.4, paymentMethod: "card_terminal", paymentStatus: "pending",
    items: [{ slug: "cappuccino", quantity: 1, variant: "Large · 16 oz", addons: ["Almond milk"] }, { slug: "butter-croissant", quantity: 1, addons: ["Warmed"] }] },
  { customer: 5, location: "dha", orderType: "delivery", status: "out_for_delivery", hoursAgo: 1.1, zoneId: IDS.zoneCantt, paymentMethod: "cash_on_delivery", paymentStatus: "pending", couponCode: "FREESHIP",
    items: [{ slug: "brioche-french-toast", quantity: 1 }, { slug: "matcha-latte", quantity: 2, variant: "Iced", addons: ["Oat milk", "Less sweet"] }] },
  { customer: 6, location: "gulberg", orderType: "delivery", status: "completed", hoursAgo: 26, zoneId: IDS.zoneGulberg, paymentMethod: "cash_on_delivery", paymentStatus: "paid",
    items: [{ slug: "chicken-pesto-panini", quantity: 2 }, { slug: "iced-spanish-latte", quantity: 2, variant: "Regular · 16 oz", addons: ["Whole milk", "Regular"] }] },
  { customer: 7, location: "dha", orderType: "pickup", status: "completed", hoursAgo: 30, paymentMethod: "card_terminal", paymentStatus: "paid",
    items: [{ slug: "cafe-latte", quantity: 2, variant: "Regular · 12 oz", addons: ["Oat milk", "Vanilla syrup"] }, { slug: "cardamom-cinnamon-bun", quantity: 2 }] },
  { customer: 3, location: "gulberg", orderType: "dine_in", status: "completed", hoursAgo: 52, tableNumber: "T2", guests: 4, paymentMethod: "card_terminal", paymentStatus: "paid",
    items: [{ slug: "buttermilk-pancakes", quantity: 1, variant: "Stack of 5" }, { slug: "chilli-egg-sourdough", quantity: 2, addons: ["Smoked chicken"] }, { slug: "v60-pour-over", quantity: 2, variant: "Ethiopia Guji · floral, peach" }, { slug: "espresso-tiramisu", quantity: 1 }] },
  { customer: 8, location: "dha", orderType: "delivery", status: "completed", hoursAgo: 75, zoneId: IDS.zoneDha, paymentMethod: "cash_on_delivery", paymentStatus: "paid",
    items: [{ slug: "smoked-chicken-club", quantity: 1 }, { slug: "americano", quantity: 2, variant: "Large · 16 oz" }] },
  { customer: 2, location: "gulberg", orderType: "delivery", status: "cancelled", hoursAgo: 100, zoneId: IDS.zoneCentral, paymentMethod: "cash_on_delivery", paymentStatus: "cancelled", notes: "Customer requested cancellation — left the office early.",
    items: [{ slug: "chocolate-ganache-cake", quantity: 1, variant: "Whole cake · serves 8" }] },
];

export { cust };

// ---------------------------------------------------------------------------
// Website content
// ---------------------------------------------------------------------------
const gal = (file: string) => `${IMG}/gallery/${file}.jpg`;

export const WEBSITE_CONFIG = {
  announcement: {
    enabled: true,
    text: "Fresh croissants out of the oven every morning from 8 am — order ahead for pickup",
    linkLabel: "Order ahead",
    linkHref: `${BASE}/menu`,
  },
  // Light header: white-dominant brand, navy type once the header leaves the hero.
  navigation: { items: NAV, showCart: true, sticky: true, tone: "light" },
  footer: {
    tagline: "Small-batch coffee, a morning bakery and a bright room to sit in — specialty coffee in Lahore.",
    columns: [
      { title: "Explore", links: [
        { label: "Menu", href: `${BASE}/menu`, enabled: true },
        { label: "Our story", href: `${BASE}/about` },
        { label: "Contact", href: `${BASE}/contact` },
        { label: "Book a table", href: `${BASE}/reservation`, enabled: true },
        { label: "Reviews", href: `${BASE}/reviews`, enabled: true },
        { label: "Cafés", href: `${BASE}/locations`, enabled: true },
      ] },
      { title: "Visit", links: [
        { label: "MM Alam Road", href: `${BASE}/locations` },
        { label: "DHA Phase 6", href: `${BASE}/locations` },
      ] },
    ],
    legalNote: "Prices exclude sales tax, shown at checkout.",
  },
  ordering: { defaultOrderType: "pickup", allowGuestCheckout: true, showPrepTime: true, ctaLabel: "Order ahead" },
  contact: { email: RESTAURANT.email, showWhatsapp: true },
  social: { instagram: RESTAURANT.social.instagram, facebook: RESTAURANT.social.facebook },
};

export const HOME_SECTIONS = [
  {
    type: "hero", enabled: true, eyebrow: "Specialty coffee · Lahore",
    title: "Coffee worth slowing down for",
    subtitle: "Roasted in small batches, pulled to order and served with pastries baked this morning. Order ahead for pickup or have it delivered in about 30 minutes.",
    image: { url: `${IMG}/hero.jpg`, alt: "Latte art on flat whites at Blue Hour Coffee" },
    alignment: "left", overlay: 0.5, height: "lg",
    primaryCta: { label: "Order ahead", href: `${BASE}/menu`, style: "primary" },
    secondaryCta: { label: "See the menu", href: `${BASE}/menu`, style: "outline" },
    highlights: ["Roasted twice a week", "Pastries baked daily", "Ready in 10 minutes"],
  },
  {
    type: "order_type_switch", enabled: true, title: "How would you like your coffee?",
    subtitle: "Pick up at the counter, have it delivered across Lahore, or stay a while with us.",
    orderTypes: ["pickup", "delivery", "dine_in"],
  },
  {
    type: "featured_items", enabled: true, title: "Barista favourites", subtitle: "The cups and bakes our regulars order every day.",
    itemSlugs: ["spanish-latte", "flat-white", "cold-brew", "matcha-latte", "almond-croissant", "avocado-soft-egg-rye"],
    limit: 6, layout: "grid", cta: { label: "See the full menu", href: `${BASE}/menu`, style: "outline" },
  },
  { type: "menu_categories", enabled: true, title: "Explore the menu", subtitle: "From the espresso bar to the bakery case.", limit: 7, showImages: true },
  {
    type: "about", enabled: true, eyebrow: "Our story", title: "Roasted on Tuesdays and Fridays, poured every day",
    body: "Blue Hour started in 2019 as a six-seat espresso bar on MM Alam Road. Today we roast our own beans in small batches, bake every pastry in-house from 6 am, and still weigh every shot. We named it for the quiet stretch of light just before sunrise and just after sunset — the best times for a good cup.",
    image: { url: `${IMG}/about.jpg`, alt: "Freshly roasted beans cooling in the Blue Hour roaster" }, imagePosition: "left",
    stats: [
      { value: "2019", label: "First cup poured" }, { value: "4", label: "Single origins on bar" },
      { value: "2", label: "Cafés in Lahore" }, { value: "4.8", label: "Average rating" },
    ],
    cta: { label: "Read our story", href: `${BASE}/about`, style: "outline" },
  },
  {
    type: "gallery", enabled: true, title: "Inside Blue Hour", subtitle: "Bright rooms, a busy bar and a terrace full of plants.",
    images: [
      { url: gal("espresso-bar"), alt: "The espresso bar at MM Alam Road" },
      { url: gal("long-room"), alt: "Long communal tables in the main room" },
      { url: gal("barista"), alt: "A barista pulling a shot" },
      { url: gal("terrace"), alt: "The planted terrace at DHA Phase 6" },
      { url: gal("street-tables"), alt: "Street-side tables in the afternoon" },
      { url: gal("morning-rush"), alt: "The morning rush at the counter" },
    ],
    columns: 3,
  },
  {
    type: "why_choose_us", enabled: true, title: "Why it tastes better here",
    items: [
      { icon: "coffee", title: "Roasted in-house", description: "Small batches twice a week, so every bag on the bar is less than ten days from roast." },
      { icon: "croissant", title: "Baked every morning", description: "Croissant dough is laminated by hand over three days and baked from 6 am." },
      { icon: "clock", title: "Ready in 10 minutes", description: "Order ahead and skip the queue. Your cup is waiting at the pickup shelf." },
      { icon: "leaf", title: "Traceable beans", description: "We buy directly from farms in Ethiopia, Colombia and Kenya and pay above fair-trade prices." },
    ],
  },
  { type: "reviews", enabled: true, title: "From our regulars", subtitle: "Real reviews from verified orders.", limit: 6, layout: "grid", showCta: true },
  {
    type: "reservation_cta", enabled: true, title: "Save a table for brunch",
    subtitle: "Weekend mornings fill up fast. Book the long table for groups of up to eight.",
    image: { url: gal("long-room"), alt: "The main room at Blue Hour" }, phoneLabel: "Or call us",
    cta: { label: "Book a table", href: `${BASE}/reservation`, style: "primary" },
  },
  { type: "locations", enabled: true, title: "Find a café", subtitle: "Two cafés in Lahore, open from early morning, seven days a week.", showMap: true, limit: 4 },
  {
    type: "cta", enabled: true, title: "Your coffee can be ready in 10 minutes.", subtitle: "Order ahead for pickup, or get it delivered across Lahore.",
    tone: "primary", cta: { label: "Start your order", href: `${BASE}/menu`, style: "primary" },
  },
];

export const ABOUT_SECTIONS = [
  {
    type: "hero", enabled: true, eyebrow: "About Blue Hour", title: "Six seats, one grinder, a lot of patience",
    subtitle: "How a tiny espresso bar became Lahore's neighbourhood roastery.",
    image: { url: `${IMG}/about.jpg`, alt: "The Blue Hour roaster" }, height: "sm", alignment: "center",
  },
  {
    type: "rich_text", enabled: true, title: "How it started",
    body: "In 2019 Sana Rehman came home from three years behind bars in Melbourne with a secondhand grinder and one idea: Lahore deserved coffee it could taste the farm in. The first Blue Hour had six seats and sold out of croissants by nine.\n\nToday we roast our own beans, bake everything in-house and run two cafés, but the routine hasn't changed. We dial in the espresso every morning, weigh every shot and throw out anything that isn't right.",
    width: "narrow",
  },
  {
    type: "why_choose_us", enabled: true, title: "What we care about",
    items: [
      { icon: "leaf", title: "Direct trade", description: "We know the farmers who grow our coffee by name and visit them every harvest." },
      { icon: "award", title: "Obsessive about quality", description: "Every batch is cupped before it reaches the bar; every shot is weighed." },
      { icon: "users", title: "A room for everyone", description: "Fast Wi-Fi, quiet corners and a team that remembers your order." },
    ],
  },
  {
    type: "gallery", enabled: true, title: "Behind the bar",
    images: [{ url: gal("barista"), alt: "Barista at work" }, { url: gal("espresso-bar"), alt: "The espresso bar" }, { url: gal("morning-rush"), alt: "The morning rush" }],
    columns: 3,
  },
  { type: "cta", enabled: true, title: "Come in for a cup", tone: "neutral", cta: { label: "Find a café", href: `${BASE}/locations`, style: "primary" } },
];

export const CONTACT_SECTIONS = [
  { type: "hero", enabled: true, eyebrow: "Contact", title: "Say hello to Blue Hour", subtitle: "Orders, office catering, wholesale beans or feedback — we reply fast.", height: "sm", alignment: "center" },
  { type: "contact", enabled: true, title: "Get in touch", showForm: true },
  { type: "locations", enabled: true, title: "Our cafés", showMap: true },
  { type: "cta", enabled: true, title: "Ready for a cup?", tone: "primary", cta: { label: "Browse the menu", href: `${BASE}/menu`, style: "primary" } },
];

/**
 * Functional pages (menu, reservation, reviews, locations) are website pages too: `page_content` marks where the
 * built-in body (menu list, booking form, reviews, location cards) sits and overrides its heading.
 */
export const MENU_SECTIONS = [
  {
    type: "page_content", enabled: true, title: "Our menu",
    subtitle: "Espresso, slow-bar coffee, tea and matcha, fresh bakes and all-day breakfast.",
  },
  {
    type: "cta", enabled: true, title: "Coffee for the office?",
    subtitle: "Cold-brew bottles, pastry boxes and batch coffee for teams. Call us for catering orders.",
    tone: "neutral", cta: { label: "Contact us", href: `${BASE}/contact`, style: "primary" },
    secondaryCta: { label: "Find a café", href: `${BASE}/locations`, style: "outline" },
  },
];

export const RESERVATION_SECTIONS = [
  {
    type: "page_content", enabled: true, title: "Book a table at Blue Hour",
    subtitle: "Pick a time and you'll get a confirmation code straight away. Weekend brunch and the terrace go first.",
  },
  {
    type: "why_choose_us", enabled: true, title: "Plan your visit",
    items: [
      { icon: "users", title: "Brunch groups", description: "The long table seats eight. Ask about pastry platters for celebrations." },
      { icon: "leaf", title: "Terrace seating", description: "Shaded and planted, with heaters in winter. Request it in the notes." },
      { icon: "clock", title: "Held for 15 minutes", description: "We keep your table for 15 minutes past your booking time." },
    ],
  },
];

export const REVIEWS_SECTIONS = [
  {
    type: "page_content", enabled: true, title: "From our regulars",
    subtitle: "Honest reviews from verified orders and visits.",
  },
  {
    type: "cta", enabled: true, title: "Craving a cup now?",
    subtitle: "Order ahead for pickup or delivery.",
    tone: "primary", cta: { label: "Start your order", href: `${BASE}/menu`, style: "primary" },
  },
];

export const LOCATIONS_SECTIONS = [
  {
    type: "page_content", enabled: true, title: "Find a café",
    subtitle: "Two cafés in Lahore, open from early morning seven days a week. Delivery areas and hours differ per café.",
  },
  { type: "contact", enabled: true, title: "Planning an office order or a group visit?", subtitle: "Call or message us; we reply within minutes.", showForm: false },
  {
    type: "cta", enabled: true, title: "Ready for a cup?", tone: "neutral",
    cta: { label: "Order ahead", href: `${BASE}/menu`, style: "primary" },
    secondaryCta: { label: "Book a table", href: `${BASE}/reservation`, style: "outline" },
  },
];

/** [public url, file name, purpose, width, height] for the media library table. */
export const MEDIA: [string, string, string, number, number][] = [
  [`${IMG}/logo.svg`, "blue-hour-logo.svg", "logo", 320, 96],
  [`${IMG}/cover.jpg`, "blue-hour-cover.jpg", "cover", 1920, 1080],
  [`${IMG}/hero.jpg`, "blue-hour-hero.jpg", "hero", 1920, 1080],
  [`${IMG}/about.jpg`, "blue-hour-about.jpg", "website", 1920, 1080],
  ...["espresso-bar", "long-room", "barista", "terrace", "street-tables", "morning-rush"].map(
    (name): [string, string, string, number, number] => [gal(name), `${name}.jpg`, "gallery", 1600, 1067],
  ),
];
