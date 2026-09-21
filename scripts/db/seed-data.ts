/**
 * Bella Napoli demo dataset. Every value here is inserted through the real
 * schema (no shortcuts) so the storefront, kitchen screen and reports all read
 * genuine database rows.
 */

export const IDS = {
  restaurant: "11111111-1111-4111-8111-111111111111",
  locationGulberg: "11111111-1111-4111-8111-111111110001",
  locationDha: "11111111-1111-4111-8111-111111110002",
  website: "11111111-1111-4111-8111-111111112001",
  pageHome: "11111111-1111-4111-8111-111111113001",
  pageAbout: "11111111-1111-4111-8111-111111113002",
  pageContact: "11111111-1111-4111-8111-111111113003",

  userOwner: "22222222-2222-4222-8222-222222220001",
  userAdmin: "22222222-2222-4222-8222-222222220002",
  userManager: "22222222-2222-4222-8222-222222220003",
  userChef: "22222222-2222-4222-8222-222222220004",
  userCustomer: "22222222-2222-4222-8222-222222220005",
  userDiner: "22222222-2222-4222-8222-222222220006",

  memberOwner: "33333333-3333-4333-8333-333333330001",
  memberAdmin: "33333333-3333-4333-8333-333333330002",
  memberManager: "33333333-3333-4333-8333-333333330003",
  memberChef: "33333333-3333-4333-8333-333333330004",

  categoryStarters: "44444444-4444-4444-8444-444444440001",
  categoryPizza: "44444444-4444-4444-8444-444444440002",
  categoryPasta: "44444444-4444-4444-8444-444444440003",
  categoryGrill: "44444444-4444-4444-8444-444444440004",
  categoryDesserts: "44444444-4444-4444-8444-444444440005",
  categoryDrinks: "44444444-4444-4444-8444-444444440006",

  zoneGulberg: "55555555-5555-4555-8555-555555550001",
  zoneDhaCantt: "55555555-5555-4555-8555-555555550002",
  zoneModelTown: "55555555-5555-4555-8555-555555550003",
  zoneDhaPhase5: "55555555-5555-4555-8555-555555550004",
  zoneBahria: "55555555-5555-4555-8555-555555550005",

  couponWelcome: "66666666-6666-4666-8666-666666660001",
  couponFlat: "66666666-6666-4666-8666-666666660002",
  couponFreeDelivery: "66666666-6666-4666-8666-666666660003",
  couponExpired: "66666666-6666-4666-8666-666666660004",

  customerAyesha: "77777777-7777-4777-8777-777777770001",
  customerBilal: "77777777-7777-4777-8777-777777770002",
  customerSana: "77777777-7777-4777-8777-777777770003",
  customerHamza: "77777777-7777-4777-8777-777777770004",
  customerZara: "77777777-7777-4777-8777-777777770005",
  customerUsman: "77777777-7777-4777-8777-777777770006",
  customerFatima: "77777777-7777-4777-8777-777777770007",
  customerAli: "77777777-7777-4777-8777-777777770008",
} as const;

/** Second tenant used to prove tenant isolation end to end. */
export const SAKURA = {
  restaurant: "99999999-9999-4999-8999-999999990001",
  location: "99999999-9999-4999-8999-999999990002",
  website: "99999999-9999-4999-8999-999999990003",
  userOwner: "99999999-9999-4999-8999-999999990004",
  memberOwner: "99999999-9999-4999-8999-999999990005",
  category: "99999999-9999-4999-8999-999999990006",
} as const;

// The second-tenant menu items / customers / orders get deterministic ids below.

export const BELLA = {
  name: "Bella Napoli",
  slug: "bella-napoli",
  legalName: "Bella Napoli Restaurants (Pvt) Ltd",
  shortDescription: "Wood-fired Neapolitan pizzas, hand-rolled pasta and a dining room built for long dinners.",
  description:
    "Bella Napoli started in 2014 with a single stone oven shipped from Naples and a stubborn belief that dough deserves 48 hours. Today two Lahore kitchens turn out blistered, leopard-spotted pizzas, slow-simmered ragù and desserts made fresh every afternoon. Family recipes, Lahore hospitality.",
  cuisines: ["Italian", "Pizza", "Mediterranean", "Desserts"],
  phone: "+92 42 3577 8899",
  whatsapp: "+92 300 8412 776",
  email: "hello@bellanapoli.pk",
  address: {
    line1: "24-C, M.M. Alam Road",
    area: "Gulberg III",
    city: "Lahore",
    state: "Punjab",
    postalCode: "54660",
    country: "PK",
    latitude: 31.5105,
    longitude: 74.3438,
  },
  currency: "PKR",
  currencySymbol: "Rs",
  timezone: "Asia/Karachi",

  /** Restaurant-level configuration (settings JSONB). */
  settings: {
    tax: { enabled: true, rate: 5, included: false, applyOnDeliveryFee: false, label: "GST" },
    serviceFee: { enabled: false, rate: 0, orderTypes: ["dine_in"] },
    ordering: {
      onlineOrderingEnabled: true,
      minimumOrderAmount: 500,
      maxAdvanceDays: 3,
      allowScheduledOrders: true,
      preparationTimeMinutes: 20,
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
      maxGuests: 12,
      autoConfirm: true,
      maxAdvanceDays: 30,
      defaultDurationMinutes: 90,
      tables: [
        { name: "T1", seats: 2 },
        { name: "T2", seats: 2 },
        { name: "T3", seats: 4 },
        { name: "T4", seats: 4 },
        { name: "T5", seats: 6 },
        { name: "T6", seats: 8 },
        { name: "Terrace 1", seats: 4 },
        { name: "Terrace 2", seats: 6 },
      ],
    },
    delivery: { enabled: true, defaultEtaMinutes: 40, freeDeliveryOver: null, trackingEnabled: true },
    loyalty: { enabled: false, pointsPerCurrencyUnit: 1, redeemRate: 0.01 },
    receipt: { footerNote: "Shukriya for dining with Bella Napoli. Follow @bellanapoli.pk", showTaxNumber: false },
  },

  features: {
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
  },

  hours: {
    mon: [{ open: "12:00", close: "23:30" }],
    tue: [{ open: "12:00", close: "23:30" }],
    wed: [{ open: "12:00", close: "23:30" }],
    thu: [{ open: "12:00", close: "23:30" }],
    fri: [{ open: "12:00", close: "01:00" }],
    sat: [{ open: "12:00", close: "01:00" }],
    sun: [{ open: "12:00", close: "23:00" }],
  },

  hoursDha: {
    mon: [{ open: "13:00", close: "23:00" }],
    tue: [{ open: "13:00", close: "23:00" }],
    wed: [{ open: "13:00", close: "23:00" }],
    thu: [{ open: "13:00", close: "23:00" }],
    fri: [{ open: "13:00", close: "01:00" }],
    sat: [{ open: "12:00", close: "01:00" }],
    sun: [{ open: "12:00", close: "23:00" }],
  },

  theme: {
    name: "Tomato Red",
    primary: "#C8102E",
    primaryForeground: "#FFFFFF",
    secondary: "#1F2933",
    accent: "#E8B04B",
    background: "#FFF8F0",
    surface: "#FFFFFF",
    foreground: "#1A1A1A",
    muted: "#6B7280",
    border: "#E7E1D8",
    font: "Playfair Display",
    bodyFont: "Inter",
    radius: "md",
    dark: false,
  },

  nav: [
    { label: "Home", href: "/r/bella-napoli" },
    { label: "Menu", href: "/r/bella-napoli/menu" },
    { label: "Reservations", href: "/r/bella-napoli/reservation" },
    { label: "Reviews", href: "/r/bella-napoli/reviews" },
    { label: "Locations", href: "/r/bella-napoli/locations" },
  ],
};

export interface SeedCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  image: string;
  icon: string;
  featured?: boolean;
}

export const CATEGORIES: SeedCategory[] = [
  { id: IDS.categoryStarters, name: "Starters & Small Plates", slug: "starters", description: "Bread from the oven, plates made for sharing.", image: "/images/menu/garlic-bread.jpg", icon: "wheat" },
  { id: IDS.categoryPizza, name: "Wood-Fired Pizza", slug: "pizza", description: "48-hour dough, blistered crust, generous toppings.", image: "/images/menu/margherita-pizza.jpg", icon: "pizza", featured: true },
  { id: IDS.categoryPasta, name: "Fresh Pasta", slug: "pasta", description: "Rolled every morning, sauced to order.", image: "/images/menu/chicken-alfredo.jpg", icon: "utensils", featured: true },
  { id: IDS.categoryGrill, name: "Charcoal Grill", slug: "grill", description: "Marinated overnight, grilled over charcoal.", image: "/images/menu/grill-platter.jpg", icon: "flame" },
  { id: IDS.categoryDesserts, name: "Dolci", slug: "desserts", description: "Made in-house every afternoon.", image: "/images/menu/gulab-jamun.jpg", icon: "cake", featured: true },
  { id: IDS.categoryDrinks, name: "Drinks & Coolers", slug: "drinks", description: "Freshly squeezed, shaken and poured.", image: "/images/menu/mint-margarita.jpg", icon: "cup-soda", featured: true },
];

export interface SeedVariant {
  name: string;
  price: string;
  isDefault?: boolean;
}

export interface SeedAddonGroup {
  name: string;
  isRequired?: boolean;
  minSelect?: number;
  maxSelect?: number;
  addons: { name: string; price: string; isDefault?: boolean; maxQuantity?: number }[];
}

export interface SeedItem {
  name: string;
  slug: string;
  categoryId: string;
  image: string;
  price: string;
  compareAtPrice?: string;
  description: string;
  shortDescription?: string;
  prepTime: number;
  spiceLevel?: number;
  dietaryTags?: string[];
  allergens?: string[];
  featured?: boolean;
  available?: boolean;
  active?: boolean;
  calories?: number;
  variants?: SeedVariant[];
  addonGroups?: SeedAddonGroup[];
}

const PIZZA_TOPPINGS: SeedAddonGroup = {
  name: "Extra toppings",
  maxSelect: 4,
  addons: [
    { name: "Extra mozzarella", price: "200.00" },
    { name: "Grilled chicken", price: "250.00" },
    { name: "Beef pepperoni", price: "280.00" },
    { name: "Black olives", price: "100.00" },
    { name: "Mushrooms", price: "120.00" },
    { name: "Jalapeños", price: "80.00" },
    { name: "Sun-dried tomatoes", price: "150.00" },
  ],
};

const PIZZA_CRUST: SeedAddonGroup = {
  name: "Choose your crust",
  isRequired: true,
  minSelect: 1,
  maxSelect: 1,
  addons: [
    { name: "Classic Neapolitan", price: "0.00", isDefault: true },
    { name: "Thin & crisp", price: "0.00" },
    { name: "Stuffed crust", price: "250.00" },
  ],
};

const PIZZA_SAUCE: SeedAddonGroup = {
  name: "Sauce & finishing",
  maxSelect: 2,
  addons: [
    { name: "Extra napoletana sauce", price: "60.00" },
    { name: "Chilli oil drizzle", price: "0.00" },
    { name: "Garlic aioli dip", price: "80.00" },
  ],
};

export const ITEMS: SeedItem[] = [
  // ── Starters ─────────────────────────────────────────────────────────────
  {
    name: "Garlic Bread Napoli",
    slug: "garlic-bread-napoli",
    categoryId: IDS.categoryStarters,
    image: "/images/menu/garlic-bread.jpg",
    price: "390.00",
    description: "Wood-fired dough brushed with garlic butter, parsley and a dusting of parmesan.",
    prepTime: 10,
    dietaryTags: ["vegetarian"],
    allergens: ["gluten", "dairy"],
    featured: true,
  },
  {
    name: "Bruschetta al Pomodoro",
    slug: "bruschetta-al-pomodoro",
    categoryId: IDS.categoryStarters,
    image: "/images/menu/bruschetta.jpg",
    price: "490.00",
    description: "Grilled sourdough, marinated cherry tomatoes, basil and aged balsamic.",
    prepTime: 10,
    dietaryTags: ["vegetarian", "vegan"],
    allergens: ["gluten"],
  },
  {
    name: "Charcoal Chicken Wings",
    slug: "charcoal-chicken-wings",
    categoryId: IDS.categoryStarters,
    image: "/images/menu/chicken-wings.jpg",
    price: "690.00",
    description: "Overnight-marinated wings finished over charcoal with a smoky chilli glaze.",
    prepTime: 18,
    spiceLevel: 2,
    dietaryTags: ["halal"],
    variants: [
      { name: "6 pieces", price: "690.00", isDefault: true },
      { name: "12 pieces", price: "1290.00" },
    ],
    addonGroups: [
      {
        name: "Dips",
        maxSelect: 2,
        addons: [
          { name: "Garlic aioli", price: "80.00" },
          { name: "Blue cheese", price: "120.00" },
          { name: "Chilli honey", price: "90.00" },
        ],
      },
    ],
  },
  {
    name: "Loaded Polenta Fries",
    slug: "loaded-polenta-fries",
    categoryId: IDS.categoryStarters,
    image: "/images/menu/polenta-fries.jpg",
    price: "550.00",
    description: "Crisp polenta fingers, molten mozzarella, arrabbiata dip and herbs.",
    prepTime: 14,
    dietaryTags: ["vegetarian"],
    allergens: ["dairy"],
    spiceLevel: 1,
  },

  // ── Pizza ────────────────────────────────────────────────────────────────
  {
    name: "Margherita Pizza",
    slug: "margherita-pizza",
    categoryId: IDS.categoryPizza,
    image: "/images/menu/margherita-pizza.jpg",
    price: "950.00",
    description:
      "The one that started it all: San Marzano tomato, fior di latte, fresh basil and Sicilian olive oil on a 48-hour dough.",
    shortDescription: "San Marzano, fior di latte, basil",
    prepTime: 16,
    dietaryTags: ["vegetarian"],
    allergens: ["gluten", "dairy"],
    featured: true,
    calories: 780,
    variants: [
      { name: 'Small 9"', price: "950.00", isDefault: true },
      { name: 'Medium 12"', price: "1250.00" },
      { name: 'Large 15"', price: "1590.00" },
    ],
    addonGroups: [PIZZA_CRUST, PIZZA_TOPPINGS, PIZZA_SAUCE],
  },
  {
    name: "Chicken Tikka Pizza",
    slug: "chicken-tikka-pizza",
    categoryId: IDS.categoryPizza,
    image: "/images/menu/chicken-tikka-pizza.jpg",
    price: "1090.00",
    compareAtPrice: "1290.00",
    description:
      "Tandoori-marinated chicken, roasted peppers, red onion and a swirl of mint yoghurt over mozzarella.",
    shortDescription: "Tandoori chicken, peppers, mint yoghurt",
    prepTime: 18,
    spiceLevel: 2,
    dietaryTags: ["halal"],
    allergens: ["gluten", "dairy"],
    featured: true,
    calories: 910,
    variants: [
      { name: 'Small 9"', price: "1090.00", isDefault: true },
      { name: 'Medium 12"', price: "1450.00" },
      { name: 'Large 15"', price: "1890.00" },
    ],
    addonGroups: [PIZZA_CRUST, PIZZA_TOPPINGS],
  },
  {
    name: "Beef Pepperoni Pizza",
    slug: "beef-pepperoni-pizza",
    categoryId: IDS.categoryPizza,
    image: "/images/menu/pepperoni-pizza.jpg",
    price: "1150.00",
    description: "Crisp-edged pepperoni cups, mozzarella, oregano and a touch of chilli honey.",
    prepTime: 17,
    dietaryTags: ["halal"],
    allergens: ["gluten", "dairy"],
    featured: true,
    variants: [
      { name: 'Small 9"', price: "1150.00", isDefault: true },
      { name: 'Medium 12"', price: "1520.00" },
    ],
    addonGroups: [PIZZA_CRUST, PIZZA_TOPPINGS],
  },
  {
    name: "Fajita Fusion Pizza",
    slug: "fajita-fusion-pizza",
    categoryId: IDS.categoryPizza,
    image: "/images/menu/fajita-pizza.jpg",
    price: "1120.00",
    description: "Smoked chicken, tri-colour peppers, sweetcorn and jalapeños with a cumin-cream base.",
    prepTime: 17,
    spiceLevel: 3,
    dietaryTags: ["halal"],
    allergens: ["gluten", "dairy"],
    variants: [
      { name: 'Small 9"', price: "1120.00", isDefault: true },
      { name: 'Medium 12"', price: "1480.00" },
    ],
    addonGroups: [PIZZA_CRUST, PIZZA_TOPPINGS],
  },
  {
    name: "Quattro Formaggi",
    slug: "quattro-formaggi",
    categoryId: IDS.categoryPizza,
    image: "/images/menu/quattro-formaggi.jpg",
    price: "1290.00",
    description: "Mozzarella, gorgonzola, taleggio and parmesan with honey and toasted walnuts.",
    prepTime: 16,
    dietaryTags: ["vegetarian"],
    allergens: ["gluten", "dairy", "nuts"],
    variants: [
      { name: 'Small 9"', price: "1290.00", isDefault: true },
      { name: 'Medium 12"', price: "1690.00" },
    ],
    addonGroups: [PIZZA_CRUST, PIZZA_TOPPINGS],
  },
  {
    name: "Truffle Mushroom Pizza",
    slug: "truffle-mushroom-pizza",
    categoryId: IDS.categoryPizza,
    image: "/images/menu/truffle-mushroom-pizza.jpg",
    price: "1390.00",
    description: "Wild mushrooms, truffle cream, scamorza and thyme.",
    prepTime: 18,
    dietaryTags: ["vegetarian"],
    allergens: ["gluten", "dairy"],
    variants: [
      { name: 'Small 9"', price: "1390.00", isDefault: true },
      { name: 'Medium 12"', price: "1790.00" },
    ],
    addonGroups: [PIZZA_CRUST, PIZZA_TOPPINGS],
  },

  // ── Pasta ────────────────────────────────────────────────────────────────
  {
    name: "Chicken Alfredo Fettuccine",
    slug: "chicken-alfredo-fettuccine",
    categoryId: IDS.categoryPasta,
    image: "/images/menu/chicken-alfredo.jpg",
    price: "1150.00",
    description: "Hand-rolled fettuccine in a slow-reduced parmesan cream with grilled chicken.",
    prepTime: 20,
    dietaryTags: ["halal"],
    allergens: ["gluten", "dairy"],
    featured: true,
    variants: [
      { name: "Regular", price: "1150.00", isDefault: true },
      { name: "Large", price: "1550.00" },
    ],
    addonGroups: [
      {
        name: "Make it richer",
        maxSelect: 3,
        addons: [
          { name: "Extra grilled chicken", price: "300.00" },
          { name: "Extra parmesan", price: "120.00" },
          { name: "Truffle oil", price: "250.00" },
        ],
      },
    ],
  },
  {
    name: "Penne Arrabbiata",
    slug: "penne-arrabbiata",
    categoryId: IDS.categoryPasta,
    image: "/images/menu/penne-arrabbiata.jpg",
    price: "950.00",
    description: "Slow-cooked tomato sugo, garlic, chilli flakes and basil.",
    prepTime: 16,
    spiceLevel: 2,
    dietaryTags: ["vegetarian", "vegan"],
    allergens: ["gluten"],
  },
  {
    name: "Lasagna al Forno",
    slug: "lasagna-al-forno",
    categoryId: IDS.categoryPasta,
    image: "/images/menu/lasagna.jpg",
    price: "1350.00",
    description: "Layers of ragù, béchamel and pasta baked till bubbling, with a herb salad.",
    prepTime: 25,
    dietaryTags: ["halal"],
    allergens: ["gluten", "dairy"],
    featured: true,
  },
  {
    name: "Spaghetti Bolognese",
    slug: "spaghetti-bolognese",
    categoryId: IDS.categoryPasta,
    image: "/images/menu/spaghetti-bolognese.jpg",
    price: "1250.00",
    description: "Three-hour beef and herb ragù over spaghetti, finished with pecorino.",
    prepTime: 18,
    dietaryTags: ["halal"],
    allergens: ["gluten", "dairy"],
  },

  // ── Grill ────────────────────────────────────────────────────────────────
  {
    name: "Mixed Grill Platter",
    slug: "mixed-grill-platter",
    categoryId: IDS.categoryGrill,
    image: "/images/menu/grill-platter.jpg",
    price: "2450.00",
    description: "Seekh kebab, chicken tikka, lamb chops and grilled vegetables with two sauces.",
    prepTime: 30,
    spiceLevel: 2,
    dietaryTags: ["halal"],
    featured: true,
    available: true,
  },
  {
    name: "Grilled Lamb Chops",
    slug: "grilled-lamb-chops",
    categoryId: IDS.categoryGrill,
    image: "/images/menu/lamb-chops.jpg",
    price: "1980.00",
    description: "Rosemary and yoghurt marinated chops, charred to pink.",
    prepTime: 26,
    spiceLevel: 1,
    dietaryTags: ["halal"],
  },

  // ── Desserts ─────────────────────────────────────────────────────────────
  {
    name: "Gulab Jamun",
    slug: "gulab-jamun",
    categoryId: IDS.categoryDesserts,
    image: "/images/menu/gulab-jamun.jpg",
    price: "350.00",
    description: "Warm milk dumplings in cardamom-rose syrup with pistachio and a scoop of vanilla gelato.",
    shortDescription: "Cardamom-rose syrup, pistachio, gelato",
    prepTime: 8,
    dietaryTags: ["vegetarian"],
    allergens: ["dairy", "nuts"],
    featured: true,
    variants: [
      { name: "2 pieces", price: "350.00", isDefault: true },
      { name: "4 pieces", price: "650.00" },
    ],
    addonGroups: [
      {
        name: "Make it a sundae",
        maxSelect: 2,
        addons: [
          { name: "Extra vanilla gelato", price: "150.00" },
          { name: "Crushed pistachio", price: "90.00" },
          { name: "Rasmalai topping", price: "180.00" },
        ],
      },
    ],
  },
  {
    name: "Tiramisu della Casa",
    slug: "tiramisu-della-casa",
    categoryId: IDS.categoryDesserts,
    image: "/images/menu/tiramisu.jpg",
    price: "700.00",
    description: "Espresso-soaked savoiardi, mascarpone cream and cocoa.",
    prepTime: 6,
    dietaryTags: ["vegetarian"],
    allergens: ["dairy", "eggs", "gluten"],
  },
  {
    name: "Molten Chocolate Cake",
    slug: "molten-chocolate-cake",
    categoryId: IDS.categoryDesserts,
    image: "/images/menu/molten-cake.jpg",
    price: "750.00",
    description: "Dark chocolate fondant with a liquid centre and salted caramel gelato.",
    prepTime: 12,
    dietaryTags: ["vegetarian"],
    allergens: ["dairy", "eggs", "gluten"],
  },
  {
    name: "Panna Cotta ai Frutti",
    slug: "panna-cotta-ai-frutti",
    categoryId: IDS.categoryDesserts,
    image: "/images/menu/panna-cotta.jpg",
    price: "620.00",
    description: "Vanilla bean panna cotta with seasonal fruit compote.",
    prepTime: 6,
    dietaryTags: ["vegetarian"],
    allergens: ["dairy"],
    // Used by the storefront to demonstrate the "currently unavailable" state.
    available: false,
  },

  // ── Drinks ───────────────────────────────────────────────────────────────
  {
    name: "Mint Margarita",
    slug: "mint-margarita",
    categoryId: IDS.categoryDrinks,
    image: "/images/menu/mint-margarita.jpg",
    price: "350.00",
    description: "Fresh mint, lime and crushed ice — the coolest thing on the menu.",
    shortDescription: "Fresh mint, lime, crushed ice",
    prepTime: 5,
    dietaryTags: ["vegan"],
    featured: true,
    variants: [
      { name: "Regular", price: "350.00", isDefault: true },
      { name: "Large", price: "550.00" },
      { name: "1 litre jug", price: "1200.00" },
    ],
    addonGroups: [
      {
        name: "Flavour boost",
        maxSelect: 2,
        addons: [
          { name: "Extra mint", price: "50.00" },
          { name: "Lemon slices", price: "40.00" },
          { name: "Sparkling water", price: "80.00" },
        ],
      },
    ],
  },
  {
    name: "Mango Lassi",
    slug: "mango-lassi",
    categoryId: IDS.categoryDrinks,
    image: "/images/menu/mango-lassi.jpg",
    price: "450.00",
    description: "Sindhri mango, thick yoghurt and a pinch of cardamom.",
    prepTime: 5,
    dietaryTags: ["vegetarian"],
    allergens: ["dairy"],
  },
  {
    name: "Fresh Lime Soda",
    slug: "fresh-lime-soda",
    categoryId: IDS.categoryDrinks,
    image: "/images/menu/fresh-lime.jpg",
    price: "300.00",
    description: "Hand-squeezed limes, soda and a choice of sweet or salty.",
    prepTime: 4,
    dietaryTags: ["vegan"],
    variants: [
      { name: "Sweet", price: "300.00", isDefault: true },
      { name: "Salty", price: "300.00" },
      { name: "Mixed", price: "320.00" },
    ],
  },
  {
    name: "Espresso Doppio",
    slug: "espresso-doppio",
    categoryId: IDS.categoryDrinks,
    image: "/images/menu/espresso.jpg",
    price: "320.00",
    description: "Double shot of our house blend, roasted in Lahore.",
    prepTime: 3,
    dietaryTags: ["vegan"],
  },
  {
    name: "Soft Drink",
    slug: "soft-drink",
    categoryId: IDS.categoryDrinks,
    image: "/images/menu/soft-drink.jpg",
    price: "200.00",
    description: "Chilled 345ml can — Coke, Sprite, Fanta or Diet Coke.",
    prepTime: 2,
    dietaryTags: ["vegan"],
    variants: [
      { name: "Coke", price: "200.00", isDefault: true },
      { name: "Sprite", price: "200.00" },
      { name: "Fanta", price: "200.00" },
      { name: "Diet Coke", price: "200.00" },
    ],
  },
];

export const ZONES = [
  {
    id: IDS.zoneGulberg,
    locationId: IDS.locationGulberg,
    name: "Gulberg & Garden Town",
    description: "Delivered hot from our M.M. Alam Road kitchen.",
    areas: ["Gulberg", "Garden Town", "Model Town Link Road", "Liberty", "Main Boulevard"],
    postalCodes: ["54660", "54600"],
    fee: "100.00",
    minOrder: "800.00",
    freeOver: "3000.00",
    etaMin: 25,
    etaMax: 40,
  },
  {
    id: IDS.zoneDhaCantt,
    locationId: IDS.locationGulberg,
    name: "DHA & Cantt",
    description: "Air-conditioned fleet, orders leave in insulated bags.",
    areas: ["DHA", "Cantt", "Defence", "Askari"],
    postalCodes: ["54792", "54810"],
    fee: "150.00",
    minOrder: "1000.00",
    freeOver: "3500.00",
    etaMin: 35,
    etaMax: 55,
  },
  {
    id: IDS.zoneModelTown,
    locationId: IDS.locationGulberg,
    name: "Model Town & Johar Town",
    areas: ["Model Town", "Johar Town", "Faisal Town", "Township"],
    postalCodes: ["54700", "54782"],
    fee: "120.00",
    minOrder: "900.00",
    freeOver: null,
    etaMin: 30,
    etaMax: 45,
  },
  {
    id: IDS.zoneDhaPhase5,
    locationId: IDS.locationDha,
    name: "DHA Phase 5, 6 & 7",
    areas: ["DHA Phase 5", "DHA Phase 6", "DHA Phase 7", "DHA Phase 8"],
    postalCodes: ["54810", "54820"],
    fee: "100.00",
    minOrder: "800.00",
    freeOver: "2500.00",
    etaMin: 25,
    etaMax: 40,
  },
  {
    id: IDS.zoneBahria,
    locationId: IDS.locationDha,
    name: "Bahria & Paragon City",
    areas: ["Bahria Town", "Paragon City", "Lake City"],
    postalCodes: ["54000"],
    fee: "200.00",
    minOrder: "1500.00",
    freeOver: null,
    etaMin: 45,
    etaMax: 70,
  },
];

export const COUPONS = [
  {
    id: IDS.couponWelcome,
    code: "WELCOME10",
    description: "10% off your first order",
    type: "percentage",
    value: "10.00",
    minOrder: "1000.00",
    maxDiscount: "400.00",
    appliesTo: "order",
    usageLimit: 500,
    perCustomer: 1,
    startsAt: -30,
    endsAt: 120,
    active: true,
  },
  {
    id: IDS.couponFlat,
    code: "FLAT250",
    description: "Rs 250 off orders above Rs 2,500",
    type: "fixed",
    value: "250.00",
    minOrder: "2500.00",
    maxDiscount: null,
    appliesTo: "order",
    usageLimit: null,
    perCustomer: 2,
    startsAt: -60,
    endsAt: 60,
    active: true,
  },
  {
    id: IDS.couponFreeDelivery,
    code: "FREEDEL",
    description: "Free delivery on orders above Rs 1,500",
    type: "fixed",
    value: "150.00",
    minOrder: "1500.00",
    maxDiscount: null,
    appliesTo: "delivery_fee",
    usageLimit: 300,
    perCustomer: null,
    startsAt: -10,
    endsAt: 45,
    active: true,
  },
  {
    id: IDS.couponExpired,
    code: "RAMADAN15",
    description: "15% Iftar deal (expired)",
    type: "percentage",
    value: "15.00",
    minOrder: "1200.00",
    maxDiscount: "500.00",
    appliesTo: "order",
    usageLimit: 200,
    perCustomer: 1,
    startsAt: -400,
    endsAt: -20,
    active: true,
  },
];

export const CUSTOMERS = [
  { id: IDS.customerAyesha, name: "Ayesha Khan", phone: "+92 300 1234567", email: "ayesha.khan@example.com", userId: null },
  { id: IDS.customerBilal, name: "Bilal Ahmed", phone: "+92 321 7654321", email: "bilal.ahmed@example.com", userId: null },
  { id: IDS.customerSana, name: "Sana Malik", phone: "+92 333 4455667", email: "sana.malik@example.com", userId: IDS.userCustomer },
  { id: IDS.customerHamza, name: "Hamza Sheikh", phone: "+92 345 9988776", email: "hamza.sheikh@example.com", userId: null },
  { id: IDS.customerZara, name: "Zara Iqbal", phone: "+92 301 2233445", email: "zara.iqbal@example.com", userId: null },
  { id: IDS.customerUsman, name: "Usman Tariq", phone: "+92 302 5566778", email: "usman.tariq@example.com", userId: null },
  { id: IDS.customerFatima, name: "Fatima Raza", phone: "+92 311 8899001", email: "fatima.raza@example.com", userId: IDS.userDiner },
  { id: IDS.customerAli, name: "Ali Raza", phone: "+92 336 1122334", email: "ali.raza@example.com", userId: null },
];

export const ADDRESSES = [
  { customerId: IDS.customerAyesha, label: "Home", line1: "House 42, Street 8, Block C", area: "Gulberg III", city: "Lahore", default: true },
  { customerId: IDS.customerBilal, label: "Home", line1: "Flat 5-B, Askari 11", area: "DHA", city: "Lahore", default: true },
  { customerId: IDS.customerSana, label: "Home", line1: "House 118, Block J", area: "Model Town", city: "Lahore", default: true },
  { customerId: IDS.customerHamza, label: "Office", line1: "Office 302, Eden Tower", area: "DHA Phase 5", city: "Lahore", default: true },
  { customerId: IDS.customerZara, label: "Home", line1: "House 9, Lane 4", area: "Bahria Town", city: "Lahore", default: true },
  { customerId: IDS.customerUsman, label: "Home", line1: "House 77, Street 12", area: "Johar Town", city: "Lahore", default: true },
  { customerId: IDS.customerFatima, label: "Home", line1: "House 24, Block D", area: "Garden Town", city: "Lahore", default: true },
  { customerId: IDS.customerAli, label: "Home", line1: "Flat 12, Gulberg Heights", area: "Gulberg", city: "Lahore", default: true },
];

export const REVIEWS = [
  { customerId: IDS.customerAyesha, itemSlug: "margherita-pizza", author: "Ayesha Khan", rating: 5, title: "Best pizza crust in Lahore", comment: "The crust is exactly like the pizza I ate in Naples — chewy, blistered and never soggy. Delivery arrived in 28 minutes and still hot.", status: "approved", featured: true, daysAgo: 3 },
  { customerId: IDS.customerBilal, itemSlug: "chicken-tikka-pizza", author: "Bilal Ahmed", rating: 5, title: "Tikka pizza done right", comment: "Generous chicken, the mint yoghurt makes it. Ordered twice this week already.", status: "approved", featured: true, daysAgo: 6 },
  { customerId: IDS.customerSana, itemSlug: "gulab-jamun", author: "Sana Malik", rating: 4, title: "Lovely finish to dinner", comment: "Warm gulab jamun with gelato is a brilliant combination. Would love a bigger portion option.", status: "approved", featured: true, daysAgo: 9 },
  { customerId: IDS.customerHamza, itemSlug: "mint-margarita", author: "Hamza Sheikh", rating: 5, title: "So refreshing", comment: "Perfectly balanced, not too sweet. The 1 litre jug is great value for family dinners.", status: "approved", featured: false, daysAgo: 12 },
  { customerId: IDS.customerZara, itemSlug: "chicken-alfredo-fettuccine", author: "Zara Iqbal", rating: 5, title: "Creamy without being heavy", comment: "You can taste that the pasta is fresh. The truffle oil add-on is worth it.", status: "approved", featured: true, daysAgo: 15 },
  { customerId: IDS.customerUsman, itemSlug: "lasagna-al-forno", author: "Usman Tariq", rating: 4, title: "Proper comfort food", comment: "Rich ragù and a good cheese pull. Slightly long wait on a Saturday night, but worth it.", status: "approved", featured: false, daysAgo: 20 },
  { customerId: null, itemSlug: "mixed-grill-platter", author: "Nadia H.", rating: 4, title: "Great for sharing", comment: "We ordered the platter for four people and there was plenty. Lamb chops were the highlight.", status: "approved", featured: false, daysAgo: 24 },
  { customerId: IDS.customerFatima, itemSlug: "bruschetta-al-pomodoro", author: "Fatima Raza", rating: 5, title: "Simple and perfect", comment: "Tomatoes tasted like summer. Lovely with the garlic bread.", status: "pending", featured: false, daysAgo: 1 },
  { customerId: null, itemSlug: "soft-drink", author: "Anonymous", rating: 2, title: "Can was warm", comment: "Drink arrived warm and the fries were missing.", status: "rejected", featured: false, daysAgo: 30 },
];

export const RESERVATIONS = [
  { customerId: IDS.customerAyesha, name: "Ayesha Khan", phone: "+92 300 1234567", email: "ayesha.khan@example.com", daysAhead: 1, time: "20:00", guests: 4, table: "T3", status: "confirmed", occasion: "Birthday", requests: "Please keep a candle for the dessert." },
  { customerId: IDS.customerBilal, name: "Bilal Ahmed", phone: "+92 321 7654321", email: "bilal.ahmed@example.com", daysAhead: 2, time: "19:30", guests: 2, table: "T1", status: "confirmed", occasion: null, requests: null },
  { customerId: IDS.customerHamza, name: "Hamza Sheikh", phone: "+92 345 9988776", email: "hamza.sheikh@example.com", daysAhead: 3, time: "21:00", guests: 6, table: "T5", status: "pending", occasion: "Anniversary", requests: "Corner table if possible." },
  { customerId: IDS.customerZara, name: "Zara Iqbal", phone: "+92 301 2233445", email: "zara.iqbal@example.com", daysAhead: 5, time: "13:30", guests: 4, table: null, status: "pending", occasion: null, requests: null },
  { customerId: IDS.customerSana, name: "Sana Malik", phone: "+92 333 4455667", email: "sana.malik@example.com", daysAhead: -3, time: "20:30", guests: 4, table: "T4", status: "completed", occasion: null, requests: null },
  { customerId: IDS.customerUsman, name: "Usman Tariq", phone: "+92 302 5566778", email: "usman.tariq@example.com", daysAhead: -1, time: "19:00", guests: 8, table: "T6", status: "no_show", occasion: null, requests: null },
];

/** Order templates. Amounts are computed by the real pricing engine, not typed in. */
export interface SeedOrder {
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  locationId: string;
  orderType: "delivery" | "pickup" | "dine_in";
  status: "pending" | "confirmed" | "preparing" | "ready" | "out_for_delivery" | "completed" | "cancelled";
  hoursAgo: number;
  zoneId?: string;
  address?: { line1: string; area: string; city: string; notes?: string };
  paymentMethod: "cash_on_delivery" | "cash" | "card_terminal";
  paymentStatus: "pending" | "paid" | "failed" | "cancelled";
  couponCode?: string;
  tableNumber?: string;
  guests?: number;
  notes?: string;
  items: { slug: string; quantity: number; variant?: string; addons?: string[] }[];
}

export const ORDERS: SeedOrder[] = [
  {
    customerId: IDS.customerAyesha, customerName: "Ayesha Khan", customerPhone: "+92 300 1234567",
    customerEmail: "ayesha.khan@example.com", locationId: IDS.locationGulberg, orderType: "delivery",
    status: "pending", hoursAgo: 0.2, zoneId: IDS.zoneGulberg,
    address: { line1: "House 42, Street 8, Block C", area: "Gulberg III", city: "Lahore", notes: "Ring the bell twice" },
    paymentMethod: "cash_on_delivery", paymentStatus: "pending", couponCode: "WELCOME10",
    items: [
      { slug: "margherita-pizza", quantity: 1, variant: 'Medium 12"', addons: ["Extra mozzarella", "Classic Neapolitan"] },
      { slug: "mint-margarita", quantity: 2, variant: "Regular" },
    ],
    notes: "Please add extra napkins.",
  },
  {
    customerId: IDS.customerBilal, customerName: "Bilal Ahmed", customerPhone: "+92 321 7654321",
    customerEmail: "bilal.ahmed@example.com", locationId: IDS.locationGulberg, orderType: "delivery",
    status: "confirmed", hoursAgo: 0.5, zoneId: IDS.zoneDhaCantt,
    address: { line1: "Flat 5-B, Askari 11", area: "DHA", city: "Lahore" },
    paymentMethod: "cash_on_delivery", paymentStatus: "pending",
    items: [
      { slug: "chicken-tikka-pizza", quantity: 1, variant: 'Large 15"', addons: ["Stuffed crust"] },
      { slug: "charcoal-chicken-wings", quantity: 1, variant: "12 pieces", addons: ["Garlic aioli"] },
      { slug: "soft-drink", quantity: 2, variant: "Coke" },
    ],
  },
  {
    customerId: IDS.customerSana, customerName: "Sana Malik", customerPhone: "+92 333 4455667",
    customerEmail: "sana.malik@example.com", locationId: IDS.locationGulberg, orderType: "delivery",
    status: "preparing", hoursAgo: 0.8, zoneId: IDS.zoneModelTown,
    address: { line1: "House 118, Block J", area: "Model Town", city: "Lahore" },
    paymentMethod: "cash_on_delivery", paymentStatus: "pending", couponCode: "FLAT250",
    items: [
      { slug: "lasagna-al-forno", quantity: 2 },
      { slug: "bruschetta-al-pomodoro", quantity: 1 },
      { slug: "gulab-jamun", quantity: 2, variant: "4 pieces" },
    ],
  },
  {
    customerId: IDS.customerHamza, customerName: "Hamza Sheikh", customerPhone: "+92 345 9988776",
    customerEmail: "hamza.sheikh@example.com", locationId: IDS.locationDha, orderType: "delivery",
    status: "ready", hoursAgo: 1.1, zoneId: IDS.zoneDhaPhase5,
    address: { line1: "Office 302, Eden Tower", area: "DHA Phase 5", city: "Lahore" },
    paymentMethod: "card_terminal", paymentStatus: "pending",
    items: [
      { slug: "beef-pepperoni-pizza", quantity: 2, variant: 'Medium 12"', addons: ["Thin & crisp", "Beef pepperoni"] },
      { slug: "mint-margarita", quantity: 1, variant: "1 litre jug" },
    ],
  },
  {
    customerId: IDS.customerZara, customerName: "Zara Iqbal", customerPhone: "+92 301 2233445",
    customerEmail: "zara.iqbal@example.com", locationId: IDS.locationDha, orderType: "delivery",
    status: "out_for_delivery", hoursAgo: 1.6, zoneId: IDS.zoneDhaPhase5,
    address: { line1: "House 9, Lane 4", area: "DHA Phase 6", city: "Lahore" },
    paymentMethod: "cash_on_delivery", paymentStatus: "pending", couponCode: "FREEDEL",
    items: [
      { slug: "chicken-alfredo-fettuccine", quantity: 1, variant: "Large", addons: ["Truffle oil"] },
      { slug: "quattro-formaggi", quantity: 1, variant: 'Small 9"' },
      { slug: "tiramisu-della-casa", quantity: 1 },
    ],
  },
  {
    customerId: IDS.customerUsman, customerName: "Usman Tariq", customerPhone: "+92 302 5566778",
    customerEmail: "usman.tariq@example.com", locationId: IDS.locationGulberg, orderType: "pickup",
    status: "confirmed", hoursAgo: 0.4,
    paymentMethod: "cash", paymentStatus: "pending",
    items: [
      { slug: "mixed-grill-platter", quantity: 1 },
      { slug: "garlic-bread-napoli", quantity: 2 },
      { slug: "mango-lassi", quantity: 2 },
    ],
  },
  {
    customerId: IDS.customerFatima, customerName: "Fatima Raza", customerPhone: "+92 311 8899001",
    customerEmail: "fatima.raza@example.com", locationId: IDS.locationGulberg, orderType: "dine_in",
    status: "completed", hoursAgo: 4, tableNumber: "T3", guests: 4,
    paymentMethod: "card_terminal", paymentStatus: "paid",
    items: [
      { slug: "margherita-pizza", quantity: 2, variant: 'Large 15"', addons: ["Classic Neapolitan"] },
      { slug: "penne-arrabbiata", quantity: 1 },
      { slug: "gulab-jamun", quantity: 4, variant: "2 pieces" },
      { slug: "fresh-lime-soda", quantity: 4, variant: "Sweet" },
    ],
  },
  {
    customerId: IDS.customerAli, customerName: "Ali Raza", customerPhone: "+92 336 1122334",
    customerEmail: "ali.raza@example.com", locationId: IDS.locationGulberg, orderType: "delivery",
    status: "completed", hoursAgo: 6.5, zoneId: IDS.zoneGulberg,
    address: { line1: "Flat 12, Gulberg Heights", area: "Gulberg", city: "Lahore" },
    paymentMethod: "cash_on_delivery", paymentStatus: "paid",
    items: [
      { slug: "fajita-fusion-pizza", quantity: 1, variant: 'Medium 12"', addons: ["Jalapeños", "Extra mozzarella"] },
      { slug: "loaded-polenta-fries", quantity: 1 },
    ],
  },
  {
    customerId: IDS.customerAyesha, customerName: "Ayesha Khan", customerPhone: "+92 300 1234567",
    customerEmail: "ayesha.khan@example.com", locationId: IDS.locationGulberg, orderType: "delivery",
    status: "completed", hoursAgo: 26, zoneId: IDS.zoneGulberg,
    address: { line1: "House 42, Street 8, Block C", area: "Gulberg III", city: "Lahore" },
    paymentMethod: "cash_on_delivery", paymentStatus: "paid",
    items: [
      { slug: "chicken-tikka-pizza", quantity: 1, variant: 'Small 9"', addons: ["Classic Neapolitan", "Grilled chicken"] },
      { slug: "charcoal-chicken-wings", quantity: 1, variant: "6 pieces" },
      { slug: "mint-margarita", quantity: 2, variant: "Regular" },
    ],
  },
  {
    customerId: IDS.customerHamza, customerName: "Hamza Sheikh", customerPhone: "+92 345 9988776",
    customerEmail: "hamza.sheikh@example.com", locationId: IDS.locationDha, orderType: "delivery",
    status: "completed", hoursAgo: 30, zoneId: IDS.zoneBahria,
    address: { line1: "House 15, Sector C", area: "Bahria Town", city: "Lahore" },
    paymentMethod: "cash_on_delivery", paymentStatus: "paid",
    items: [
      { slug: "truffle-mushroom-pizza", quantity: 1, variant: 'Medium 12"' },
      { slug: "spaghetti-bolognese", quantity: 1 },
      { slug: "panna-cotta-ai-frutti", quantity: 2 },
    ],
  },
  {
    customerId: IDS.customerSana, customerName: "Sana Malik", customerPhone: "+92 333 4455667",
    customerEmail: "sana.malik@example.com", locationId: IDS.locationGulberg, orderType: "pickup",
    status: "completed", hoursAgo: 50,
    paymentMethod: "cash", paymentStatus: "paid",
    items: [
      { slug: "penne-arrabbiata", quantity: 1 },
      { slug: "garlic-bread-napoli", quantity: 1 },
      { slug: "espresso-doppio", quantity: 2 },
    ],
  },
  {
    customerId: IDS.customerZara, customerName: "Zara Iqbal", customerPhone: "+92 301 2233445",
    customerEmail: "zara.iqbal@example.com", locationId: IDS.locationDha, orderType: "delivery",
    status: "completed", hoursAgo: 74, zoneId: IDS.zoneDhaPhase5,
    address: { line1: "House 9, Lane 4", area: "DHA Phase 5", city: "Lahore" },
    paymentMethod: "cash_on_delivery", paymentStatus: "paid",
    items: [
      { slug: "grilled-lamb-chops", quantity: 2 },
      { slug: "quattro-formaggi", quantity: 1, variant: 'Medium 12"' },
      { slug: "mango-lassi", quantity: 3 },
    ],
  },
  {
    customerId: IDS.customerBilal, customerName: "Bilal Ahmed", customerPhone: "+92 321 7654321",
    customerEmail: "bilal.ahmed@example.com", locationId: IDS.locationGulberg, orderType: "delivery",
    status: "cancelled", hoursAgo: 80, zoneId: IDS.zoneDhaCantt,
    address: { line1: "Flat 5-B, Askari 11", area: "DHA", city: "Lahore" },
    paymentMethod: "cash_on_delivery", paymentStatus: "cancelled",
    items: [{ slug: "chicken-tikka-pizza", quantity: 1, variant: 'Small 9"' }],
    notes: "Customer cancelled — duplicate order.",
  },
  {
    customerId: IDS.customerUsman, customerName: "Usman Tariq", customerPhone: "+92 302 5566778",
    customerEmail: "usman.tariq@example.com", locationId: IDS.locationGulberg, orderType: "delivery",
    status: "completed", hoursAgo: 120, zoneId: IDS.zoneModelTown,
    address: { line1: "House 77, Street 12", area: "Johar Town", city: "Lahore" },
    paymentMethod: "cash_on_delivery", paymentStatus: "paid", couponCode: "WELCOME10",
    items: [
      { slug: "margherita-pizza", quantity: 2, variant: 'Large 15"', addons: ["Extra mozzarella", "Classic Neapolitan"] },
      { slug: "molten-chocolate-cake", quantity: 2 },
    ],
  },
];
