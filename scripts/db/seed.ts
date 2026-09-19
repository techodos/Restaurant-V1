/**
 * Seeds the Bella Napoli demo restaurant (plus a second tenant for isolation
 * tests) by inserting through the real schema and the real pricing engine.
 *
 *   npm run db:seed            (idempotent — replaces previous seed data)
 */
import path from "node:path";
import pg from "pg";
import { loadEnv } from "./env";
import { hashPassword } from "../../src/lib/auth/password";
import { calculatePricing } from "../../src/lib/pricing";
import { restaurantSettingsSchema, restaurantFeaturesSchema } from "../../src/lib/contract/settings";
import { toMoney, dec } from "../../src/lib/money";
import {
  ADDRESSES, BELLA, CATEGORIES, COUPONS, CUSTOMERS, IDS, ITEMS, ORDERS, RESERVATIONS, REVIEWS, SAKURA, ZONES,
} from "./seed-data";

loadEnv();

const connectionString = process.env.DATABASE_URL_MIGRATOR ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL_MIGRATOR is required");

const client = new pg.Client({ connectionString });
await client.connect();

const settings = restaurantSettingsSchema.parse(BELLA.settings);
const features = restaurantFeaturesSchema.parse(BELLA.features);

async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await client.query<T>(text, params);
  return result.rows;
}
async function one<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Tolerates thousands separators in the seed literals. */
function money(value: string | null | undefined): string | null {
  return value === null || value === undefined ? null : value.replace(/,/g, "");
}

function iso(daysOffset = 0, hoursOffset = 0): string {
  return new Date(Date.now() + daysOffset * 86_400_000 + hoursOffset * 3_600_000).toISOString();
}

// ---------------------------------------------------------------------------
// 1. Reset previous seed data (in dependency order)
// ---------------------------------------------------------------------------
console.log("• clearing previous demo data");
await client.query("begin");
await client.query(
  `delete from restaurants where slug = any($1::text[])`,
  [[BELLA.slug, "sakura-sushi-house"]],
);
await client.query(
  `delete from auth.users where id = any($1::uuid[]) or email = any($2::text[])`,
  [
    [
      IDS.userOwner, IDS.userAdmin, IDS.userManager, IDS.userChef, IDS.userCustomer, IDS.userDiner, SAKURA.userOwner,
    ],
    [
      "owner@bellanapoli.pk", "admin@bellanapoli.pk", "manager@bellanapoli.pk", "chef@bellanapoli.pk",
      "owner@sakura.pk",
    ],
  ],
);
await client.query("commit");

// ---------------------------------------------------------------------------
// 2. Bella Napoli — restaurant, locations, team, website, pages
// ---------------------------------------------------------------------------
console.log("• inserting restaurant + locations + team");
await client.query("begin");

await query(
  `insert into restaurants
     (id, name, slug, legal_name, description, short_description, cuisines, phone, whatsapp, email, website_url,
      logo_url, cover_url, primary_color, currency, currency_symbol, locale, timezone, country, status,
      plan, plan_status, features, settings, social, seo)
   values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'active','standard','active',
           $20::jsonb,$21::jsonb,$22::jsonb,$23::jsonb)`,
  [
    IDS.restaurant, BELLA.name, BELLA.slug, BELLA.legalName, BELLA.description, BELLA.shortDescription,
    BELLA.cuisines, BELLA.phone, BELLA.whatsapp, BELLA.email, "https://bellanapoli.pk",
    "/images/logo-bella-napoli.svg", "/images/cover.jpg", BELLA.theme.primary, BELLA.currency,
    BELLA.currencySymbol, "en", BELLA.timezone, "PK",
    JSON.stringify(features), JSON.stringify(settings),
    JSON.stringify({
      instagram: "https://instagram.com/bellanapoli.pk",
      facebook: "https://facebook.com/bellanapoli.pk",
      tiktok: "https://tiktok.com/@bellanapoli.pk",
    }),
    JSON.stringify({
      title: "Bella Napoli — Wood-fired pizza in Lahore",
      description: BELLA.shortDescription,
    }),
  ],
);

await query(
  `insert into restaurant_locations
     (id, restaurant_id, name, slug, is_primary, is_active, address_line1, area, city, state, postal_code, country,
      phone, email, latitude, longitude, hours, settings, sort_order)
   values
     ($1,$2,'Gulberg Flagship','gulberg',true,true,$3,$4,$5,$6,$7,'PK',$8,$9,$10,$11,$12::jsonb,$13::jsonb,1),
     ($14,$2,'DHA Phase 5','dha-phase-5',false,true,$15,$16,$5,$6,'54810','PK',$17,$9,$18,$19,$20::jsonb,$13::jsonb,2)`,
  [
    IDS.locationGulberg, IDS.restaurant, BELLA.address.line1, BELLA.address.area, BELLA.address.city,
    BELLA.address.state, BELLA.address.postalCode, BELLA.phone, BELLA.email, BELLA.address.latitude,
    BELLA.address.longitude, JSON.stringify(BELLA.hours), JSON.stringify({ diningRooms: 2, parking: true }),
    IDS.locationDha, "Commercial Area, DHA Phase 5", "DHA Phase 5", "+92 42 3577 8877", 31.4697, 74.4121,
    JSON.stringify(BELLA.hoursDha),
  ],
);

const staff = [
  { id: IDS.userOwner, member: IDS.memberOwner, email: "owner@bellanapoli.pk", name: "Imran Chaudhry", role: "owner", password: "BellaNapoli#1", phone: "+92 300 1112223" },
  { id: IDS.userAdmin, member: IDS.memberAdmin, email: "admin@bellanapoli.pk", name: "Nida Farooq", role: "admin", password: "BellaNapoli#2", phone: "+92 300 1112224" },
  { id: IDS.userManager, member: IDS.memberManager, email: "manager@bellanapoli.pk", name: "Kamran Yousuf", role: "manager", password: "BellaNapoli#3", phone: "+92 300 1112225" },
  { id: IDS.userChef, member: IDS.memberChef, email: "chef@bellanapoli.pk", name: "Shahid Mehmood", role: "staff", password: "BellaNapoli#4", phone: "+92 300 1112226" },
];
for (const person of staff) {
  await query(
    `insert into auth.users (id, email, encrypted_password, raw_user_meta_data, email_confirmed_at)
     values ($1,$2,$3, jsonb_build_object('name', $4::text), now())`,
    [person.id, person.email, await hashPassword(person.password), person.name],
  );
  await query(
    `insert into team_members
       (id, restaurant_id, user_id, location_id, email, full_name, phone, role, permissions, is_active, accepted_at, last_login_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8::team_role,'{}'::jsonb,true, now(), now() - interval '2 hours')`,
    [person.member, IDS.restaurant, person.id, IDS.locationGulberg, person.email, person.name, person.phone, person.role],
  );
}

await query(
  `insert into websites (id, restaurant_id, name, subdomain, status, is_primary, theme, config, seo, published_at)
   values ($1,$2,'Bella Napoli','bella-napoli','published',true,$3::jsonb,$4::jsonb,$5::jsonb, now() - interval '40 days')`,
  [
    IDS.website, IDS.restaurant, JSON.stringify(BELLA.theme),
    JSON.stringify({
      announcement: {
        enabled: true,
        text: "Free delivery on orders over Rs 3,000 within Gulberg & DHA",
        linkLabel: "Order now",
        linkHref: "/r/bella-napoli/menu",
      },
      navigation: { items: BELLA.nav, showCart: true, sticky: true },
      footer: {
        tagline: "Wood-fired pizza, fresh pasta and dolci — made in Lahore since 2014.",
        columns: [
          {
            title: "Explore",
            links: [
              { label: "Menu", href: "/r/bella-napoli/menu" },
              { label: "Reservations", href: "/r/bella-napoli/reservation" },
              { label: "Reviews", href: "/r/bella-napoli/reviews" },
              { label: "Locations", href: "/r/bella-napoli/locations" },
            ],
          },
          {
            title: "Visit",
            links: [
              { label: "Gulberg Flagship", href: "/r/bella-napoli/locations" },
              { label: "DHA Phase 5", href: "/r/bella-napoli/locations" },
            ],
          },
        ],
        legalNote: "Prices include applicable taxes shown at checkout.",
      },
      ordering: { defaultOrderType: "delivery", allowGuestCheckout: true, showPrepTime: true, ctaLabel: "Order online" },
      contact: { email: BELLA.email, showWhatsapp: true },
      social: {
        instagram: "https://instagram.com/bellanapoli.pk",
        facebook: "https://facebook.com/bellanapoli.pk",
      },
    }),
    JSON.stringify({ title: "Bella Napoli — Wood-fired pizza in Lahore" }),
  ],
);

console.log("• inserting website pages + sections");
const homeSections = [
  {
    type: "hero",
    enabled: true,
    eyebrow: "Wood-fired since 2014",
    title: "Naples in the heart of Lahore",
    subtitle:
      "48-hour dough, a stone oven shipped from Naples and ingredients we would happily serve to our own family. Dine in, take away or get it delivered hot.",
    image: { url: "/images/hero-pizza.jpg", alt: "Margherita pizza fresh out of the wood-fired oven" },
    alignment: "left",
    overlay: 0.5,
    height: "lg",
    primaryCta: { label: "Order online", href: "/r/bella-napoli/menu", style: "primary" },
    secondaryCta: { label: "Book a table", href: "/r/bella-napoli/reservation", style: "outline" },
    highlights: ["48-hour fermented dough", "Stone oven from Naples", "Delivery in 40 minutes"],
  },
  {
    type: "order_type_switch",
    enabled: true,
    title: "How would you like your order?",
    subtitle: "Delivery across Lahore, pickup from either kitchen, or dine in with us.",
    orderTypes: ["delivery", "pickup", "dine_in"],
  },
  {
    type: "featured_items",
    enabled: true,
    title: "Guest favourites",
    subtitle: "The plates our regulars keep coming back for.",
    itemSlugs: ["margherita-pizza", "chicken-tikka-pizza", "chicken-alfredo-fettuccine", "gulab-jamun", "mint-margarita", "beef-pepperoni-pizza"],
    limit: 6,
    layout: "grid",
    cta: { label: "See the full menu", href: "/r/bella-napoli/menu", style: "outline" },
  },
  {
    type: "menu_categories",
    enabled: true,
    title: "Explore the menu",
    subtitle: "Six sections, one very busy oven.",
    limit: 6,
    showImages: true,
  },
  {
    type: "about",
    enabled: true,
    eyebrow: "Our story",
    title: "A family kitchen that never learned to cut corners",
    body:
      "We started with one oven, twelve tables and a recipe book that belonged to Nonna Esposito. Eleven years later the dough still rests for two days, the tomatoes still come from the same grower, and every pizza is still stretched by hand. Some things are simply not worth rushing.",
    image: { url: "/images/about-story.jpg", alt: "Chef stretching pizza dough by hand" },
    imagePosition: "left",
    stats: [
      { value: "2014", label: "Opened in Gulberg" },
      { value: "48h", label: "Dough fermentation" },
      { value: "2", label: "Lahore kitchens" },
      { value: "4.8", label: "Average rating" },
    ],
    cta: { label: "Reserve a table", href: "/r/bella-napoli/reservation", style: "outline" },
  },
  {
    type: "gallery",
    enabled: true,
    title: "From our kitchen",
    subtitle: "Slow food, fast service.",
    images: [
      { url: "/images/gallery/oven.jpg", alt: "Stone oven with a pizza going in" },
      { url: "/images/gallery/dining-room.jpg", alt: "The dining room at Bella Napoli Gulberg" },
      { url: "/images/gallery/chef-hands.jpg", alt: "Chef finishing a plate" },
      { url: "/images/gallery/pasta.jpg", alt: "Fresh pasta being rolled" },
      { url: "/images/gallery/terrace.jpg", alt: "Terrace seating in the evening" },
      { url: "/images/gallery/dessert.jpg", alt: "Desserts being plated" },
    ],
    columns: 3,
  },
  {
    type: "why_choose_us",
    enabled: true,
    title: "Why guests choose us",
    items: [
      { icon: "flame", title: "Stone oven", description: "Every pizza is baked at 430°C for 90 seconds — the only way to get that crust." },
      { icon: "leaf", title: "Daily market produce", description: "Vegetables and herbs arrive each morning; nothing sits overnight." },
      { icon: "truck", title: "Insulated delivery", description: "Orders leave the kitchen in heated bags with a 40-minute promise in most areas." },
      { icon: "heart", title: "Family recipes", description: "Sauces, dough and desserts follow recipes we have never written down." },
    ],
  },
  {
    type: "reviews",
    enabled: true,
    title: "What our guests say",
    subtitle: "Real reviews from verified orders.",
    limit: 6,
    layout: "grid",
    showCta: true,
  },
  {
    type: "reservation_cta",
    enabled: true,
    title: "Book your table at Bella Napoli",
    subtitle: "Terrace seating fills up fast on weekends — reserve in under a minute.",
    image: { url: "/images/gallery/terrace.jpg", alt: "Terrace seating at Bella Napoli" },
    phoneLabel: "Or call us",
    cta: { label: "Make a reservation", href: "/r/bella-napoli/reservation", style: "primary" },
  },
  {
    type: "locations",
    enabled: true,
    title: "Find us",
    subtitle: "Two kitchens in Lahore, open seven days a week.",
    showMap: true,
    limit: 4,
  },
  {
    type: "contact",
    enabled: true,
    title: "Get in touch",
    subtitle: "Questions about a large order, catering or a missing item? We answer within minutes.",
    showForm: false,
  },
  {
    type: "cta",
    enabled: true,
    title: "Hungry now? Your pizza is 40 minutes away.",
    subtitle: "Order online for delivery, pickup or dine-in.",
    tone: "primary",
    cta: { label: "Start your order", href: "/r/bella-napoli/menu", style: "primary" },
    secondaryCta: { label: "See coupons", href: "/r/bella-napoli/checkout", style: "ghost" },
  },
];

const aboutSections = [
  {
    type: "hero",
    enabled: true,
    eyebrow: "About Bella Napoli",
    title: "Eleven years, one oven, no shortcuts",
    subtitle: "The story behind Lahore's most stubbornly traditional pizza kitchen.",
    image: { url: "/images/gallery/oven.jpg", alt: "Bella Napoli stone oven" },
    height: "sm",
    alignment: "center",
  },
  {
    type: "rich_text",
    enabled: true,
    title: "How it started",
    body:
      "In 2014 Imran Chaudhry brought a 3-tonne stone oven back from Naples in a shipping container, along with a hand-written recipe book from the Esposito family. The first Bella Napoli seated twelve people on M.M. Alam Road and closed after four hours — we had sold out of dough.\n\nToday two kitchens serve Lahore, but the rules have not changed: the dough ferments for 48 hours, the tomato sauce is cooked in small batches, and the pasta is rolled before service every single morning.",
    width: "narrow",
  },
  {
    type: "why_choose_us",
    enabled: true,
    title: "What we stand for",
    items: [
      { icon: "leaf", title: "Ingredients first", description: "Fior di latte, San Marzano tomatoes and local produce from Ravi Road market." },
      { icon: "flame", title: "Respect the craft", description: "Stretched by hand, never by machine. Baked in 90 seconds at 430°C." },
      { icon: "users", title: "Hospitality always", description: "Our team has been with us for an average of five years." },
    ],
  },
  {
    type: "gallery",
    enabled: true,
    title: "Inside the kitchen",
    images: [
      { url: "/images/gallery/kitchen.jpg", alt: "Bella Napoli kitchen team at work" },
      { url: "/images/gallery/pasta.jpg", alt: "Rolling fresh pasta" },
      { url: "/images/gallery/dining-room.jpg", alt: "The dining room" },
    ],
    columns: 3,
  },
  {
    type: "cta",
    enabled: true,
    title: "Come see for yourself",
    tone: "neutral",
    cta: { label: "Book a table", href: "/r/bella-napoli/reservation", style: "primary" },
  },
];

const contactSections = [
  {
    type: "hero",
    enabled: true,
    eyebrow: "Contact",
    title: "Talk to Bella Napoli",
    subtitle: "For orders, catering, feedback or press — we reply fast.",
    height: "sm",
    alignment: "center",
  },
  { type: "contact", enabled: true, title: "Get in touch", showForm: true },
  { type: "locations", enabled: true, title: "Our kitchens", showMap: true },
  { type: "cta", enabled: true, title: "Ready to order?", tone: "primary", cta: { label: "Browse the menu", href: "/r/bella-napoli/menu", style: "primary" } },
];

const pages = [
  { id: IDS.pageHome, slug: "home", title: "Home", description: BELLA.shortDescription, isHome: true, sections: homeSections, sort: 1 },
  { id: IDS.pageAbout, slug: "about", title: "Our story", description: "How Bella Napoli brought Neapolitan pizza to Lahore.", isHome: false, sections: aboutSections, sort: 2 },
  { id: IDS.pageContact, slug: "contact", title: "Contact", description: "Reach the Bella Napoli team.", isHome: false, sections: contactSections, sort: 3 },
];
for (const page of pages) {
  await query(
    `insert into website_pages (id, website_id, restaurant_id, slug, title, description, is_home, is_published, sort_order, sections, seo)
     values ($1,$2,$3,$4,$5,$6,$7,true,$8,$9::jsonb,$10::jsonb)`,
    [
      page.id, IDS.website, IDS.restaurant, page.slug, page.title, page.description, page.isHome, page.sort,
      JSON.stringify(page.sections), JSON.stringify({ title: page.title }),
    ],
  );
}

// ---------------------------------------------------------------------------
// 3. Media library records (binaries live in /public/images for the demo)
// ---------------------------------------------------------------------------
console.log("• inserting media library");
const mediaRecords: [string, string, string, number, number][] = [
  ["/images/logo-bella-napoli.svg", "bella-napoli-logo.svg", "logo", 320, 96],
  ["/images/cover.jpg", "bella-napoli-cover.jpg", "cover", 1920, 1080],
  ["/images/hero-pizza.jpg", "hero-margherita.jpg", "hero", 1920, 1280],
  ["/images/about-story.jpg", "dough-story.jpg", "website", 1600, 1067],
  ["/images/gallery/oven.jpg", "stone-oven.jpg", "gallery", 1600, 1067],
  ["/images/gallery/dining-room.jpg", "dining-room.jpg", "gallery", 1600, 1067],
  ["/images/gallery/chef-hands.jpg", "chef-hands.jpg", "gallery", 1600, 1067],
  ["/images/gallery/pasta.jpg", "fresh-pasta.jpg", "gallery", 1600, 1067],
  ["/images/gallery/terrace.jpg", "terrace.jpg", "gallery", 1600, 1067],
  ["/images/gallery/dessert.jpg", "dessert-plate.jpg", "gallery", 1600, 1067],
  ["/images/gallery/kitchen.jpg", "kitchen-team.jpg", "gallery", 1600, 1067],
];
for (const [url, fileName, purpose, width, height] of mediaRecords) {
  await query(
    `insert into media (restaurant_id, bucket, path, url, file_name, mime_type, size_bytes, width, height, purpose, alt_text)
     values ($1, 'restaurant-media', $2, $3, $2, $4, 0, $5, $6, $7::media_purpose, $8)`,
    [
      IDS.restaurant, fileName, url, fileName.endsWith(".svg") ? "image/svg+xml" : "image/jpeg",
      width, height, purpose, fileName.replace(/[-.]/g, " "),
    ],
  );
}

await client.query("commit");

// ---------------------------------------------------------------------------
// 4. Menu
// ---------------------------------------------------------------------------
console.log("• inserting menu");
await client.query("begin");

for (const [index, category] of CATEGORIES.entries()) {
  await query(
    `insert into menu_categories (id, restaurant_id, name, slug, description, image_url, icon, sort_order, is_active, is_featured)
     values ($1,$2,$3,$4,$5,$6,$7,$8,true,$9)`,
    [category.id, IDS.restaurant, category.name, category.slug, category.description, category.image, category.icon, index + 1, category.featured ?? false],
  );
}

const itemIdBySlug = new Map<string, string>();
for (const [index, item] of ITEMS.entries()) {
  const row = await one<{ id: string }>(
    `insert into menu_items
       (restaurant_id, category_id, name, slug, description, short_description, image_url, base_price, compare_at_price,
        calories, spice_level, prep_time_minutes, is_active, is_available, is_featured, dietary_tags, allergens, sort_order)
     values ($1,$2,$3,$4,$5,$6,$7,$8::numeric,$9::numeric,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     returning id`,
    [
      IDS.restaurant, item.categoryId, item.name, item.slug, item.description, item.shortDescription ?? null,
      item.image, money(item.price), money(item.compareAtPrice), item.calories ?? null, item.spiceLevel ?? 0,
      item.prepTime, item.active ?? true, item.available ?? true, item.featured ?? false,
      item.dietaryTags ?? [], item.allergens ?? [], index + 1,
    ],
  );
  if (!row) throw new Error(`failed to insert ${item.slug}`);
  itemIdBySlug.set(item.slug, row.id);

  for (const [variantIndex, variant] of (item.variants ?? []).entries()) {
    await query(
      `insert into menu_item_variants (restaurant_id, menu_item_id, name, price, price_mode, is_default, is_available, sort_order)
       values ($1,$2,$3,$4::numeric,'absolute',$5,true,$6)`,
      [IDS.restaurant, row.id, variant.name, money(variant.price), variant.isDefault ?? false, variantIndex + 1],
    );
  }

  for (const [groupIndex, group] of (item.addonGroups ?? []).entries()) {
    const groupRow = await one<{ id: string }>(
      `insert into menu_addon_groups
         (restaurant_id, menu_item_id, name, is_required, min_select, max_select, sort_order, is_active)
       values ($1,$2,$3,$4,$5,$6,$7,true) returning id`,
      [
        IDS.restaurant, row.id, group.name, group.isRequired ?? false,
        group.minSelect ?? (group.isRequired ? 1 : 0), group.maxSelect ?? 1, groupIndex + 1,
      ],
    );
    if (!groupRow) continue;
    for (const [addonIndex, addon] of group.addons.entries()) {
      await query(
        `insert into menu_addons (restaurant_id, addon_group_id, name, price, is_default, is_available, max_quantity, sort_order)
         values ($1,$2,$3,$4::numeric,$5,true,$6,$7)`,
        [IDS.restaurant, groupRow.id, addon.name, money(addon.price), addon.isDefault ?? false, addon.maxQuantity ?? 1, addonIndex + 1],
      );
    }
  }
}

// Delivery zones
for (const [index, zone] of ZONES.entries()) {
  await query(
    `insert into delivery_zones
       (id, restaurant_id, location_id, name, description, areas, postal_codes, delivery_fee, min_order_amount,
        free_delivery_over, eta_min_minutes, eta_max_minutes, is_active, sort_order)
     values ($1,$2,$3,$4,$5,$6,$7,$8::numeric,$9::numeric,$10::numeric,$11,$12,true,$13)`,
    [
      zone.id, IDS.restaurant, zone.locationId, zone.name, zone.description ?? null, zone.areas, zone.postalCodes,
      money(zone.fee), money(zone.minOrder), money(zone.freeOver), zone.etaMin, zone.etaMax, index + 1,
    ],
  );
}

// Coupons
for (const coupon of COUPONS) {
  await query(
    `insert into coupons
       (id, restaurant_id, code, description, discount_type, discount_value, min_order_amount, max_discount_amount,
        applies_to, order_types, starts_at, ends_at, usage_limit, usage_limit_per_customer, is_active)
     values ($1,$2,$3,$4,$5::coupon_discount_type,$6::numeric,$7::numeric,$8::numeric,$9,
             '{delivery,pickup,dine_in}'::order_type[], $10::timestamptz, $11::timestamptz, $12, $13, $14)`,
    [
      coupon.id, IDS.restaurant, coupon.code, coupon.description, coupon.type, money(coupon.value), money(coupon.minOrder),
      money(coupon.maxDiscount), coupon.appliesTo, iso(coupon.startsAt), iso(coupon.endsAt), coupon.usageLimit,
      coupon.perCustomer, coupon.active,
    ],
  );
}

await client.query("commit");

// ---------------------------------------------------------------------------
// 5. Customers, addresses, reviews, reservations
// ---------------------------------------------------------------------------
console.log("• inserting customers, reviews, reservations");
await client.query("begin");

for (const person of CUSTOMERS) {
  if (person.userId) {
    await query(
      `insert into auth.users (id, email, encrypted_password, raw_user_meta_data, email_confirmed_at)
       values ($1,$2,$3, jsonb_build_object('name', $4::text), now())`,
      [person.userId, person.email, await hashPassword("DinerPass#1"), person.name],
    );
  }
  await query(
    `insert into customers (id, restaurant_id, user_id, full_name, email, phone, is_guest, marketing_opt_in)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [person.id, IDS.restaurant, person.userId, person.name, person.email, person.phone, !person.userId, Boolean(person.userId)],
  );
}

for (const address of ADDRESSES) {
  await query(
    `insert into customer_addresses
       (restaurant_id, customer_id, label, recipient_name, phone, address_line1, area, city, postal_code, country, is_default)
     values ($1,$2,$3,$4,$5,$6,$7,$8,'54000','PK',$9)`,
    [
      IDS.restaurant, address.customerId, address.label, null,
      CUSTOMERS.find((customer) => customer.id === address.customerId)?.phone ?? null,
      address.line1, address.area, address.city, address.default,
    ],
  );
}

for (const review of REVIEWS) {
  await query(
    `insert into reviews
       (restaurant_id, customer_id, menu_item_id, author_name, rating, title, comment, status, is_featured, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8::review_status,$9,$10::timestamptz)`,
    [
      IDS.restaurant, review.customerId, review.itemSlug ? itemIdBySlug.get(review.itemSlug) ?? null : null,
      review.author, review.rating, review.title, review.comment, review.status, review.featured, iso(-review.daysAgo),
    ],
  );
}

const locationByIndex = [IDS.locationGulberg, IDS.locationGulberg, IDS.locationDha];
for (const [index, reservation] of RESERVATIONS.entries()) {
  const date = new Date(Date.now() + reservation.daysAhead * 86_400_000);
  await query(
    `insert into reservations
       (restaurant_id, location_id, customer_id, confirmation_code, guest_name, guest_email, guest_phone,
        reservation_date, reservation_time, duration_minutes, guests, table_number, special_requests, occasion, status, created_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8::date,$9::time,90,$10,$11,$12,$13,$14::reservation_status, $15::timestamptz)`,
    [
      IDS.restaurant, locationByIndex[index % locationByIndex.length], reservation.customerId,
      `BN-${(1042 + index * 7).toString().padStart(4, "0")}`, reservation.name, reservation.email, reservation.phone,
      date.toISOString().slice(0, 10), reservation.time, reservation.guests, reservation.table,
      reservation.requests, reservation.occasion, reservation.status, iso(reservation.daysAhead - 4),
    ],
  );
}

await client.query("commit");

// ---------------------------------------------------------------------------
// 6. Orders — priced by the real engine
// ---------------------------------------------------------------------------
console.log("• inserting orders (pricing through the real engine)");

interface CatalogueEntry {
  id: string;
  name: string;
  basePrice: string;
  variants: { id: string; name: string; price: string }[];
  addonGroups: { id: string; name: string; isRequired: boolean; minSelect: number; maxSelect: number; addons: { id: string; name: string; price: string }[] }[];
}

const catalogue = new Map<string, CatalogueEntry>();
{
  const itemRows = await query<{ id: string; slug: string; name: string; base_price: string }>(
    `select id, slug, name, base_price from menu_items where restaurant_id = $1`,
    [IDS.restaurant],
  );
  const variantRows = await query<{ id: string; menu_item_id: string; name: string; price: string }>(
    `select id, menu_item_id, name, price from menu_item_variants where restaurant_id = $1`,
    [IDS.restaurant],
  );
  const groupRows = await query<{ id: string; menu_item_id: string; name: string; is_required: boolean; min_select: number; max_select: number }>(
    `select id, menu_item_id, name, is_required, min_select, max_select from menu_addon_groups where restaurant_id = $1`,
    [IDS.restaurant],
  );
  const addonRows = await query<{ id: string; addon_group_id: string; name: string; price: string }>(
    `select id, addon_group_id, name, price from menu_addons where restaurant_id = $1`,
    [IDS.restaurant],
  );
  for (const item of itemRows) {
    catalogue.set(item.slug, {
      id: item.id,
      name: item.name,
      basePrice: item.base_price,
      variants: variantRows.filter((variant) => variant.menu_item_id === item.id).map((variant) => ({ id: variant.id, name: variant.name, price: variant.price })),
      addonGroups: groupRows
        .filter((group) => group.menu_item_id === item.id)
        .map((group) => ({
          id: group.id,
          name: group.name,
          isRequired: group.is_required,
          minSelect: group.min_select,
          maxSelect: group.max_select,
          addons: addonRows
            .filter((addon) => addon.addon_group_id === group.id)
            .map((addon) => ({ id: addon.id, name: addon.name, price: addon.price })),
        })),
    });
  }
}

const zoneRows = await query<{ id: string; name: string; delivery_fee: string; min_order_amount: string; free_delivery_over: string | null }>(
  `select id, name, delivery_fee, min_order_amount, free_delivery_over from delivery_zones where restaurant_id = $1`,
  [IDS.restaurant],
);
const couponRows = await query<{ id: string; code: string; discount_type: "percentage" | "fixed"; discount_value: string; min_order_amount: string; max_discount_amount: string | null; applies_to: "order" | "delivery_fee"; order_types: string[]; starts_at: string; ends_at: string; usage_limit: number | null; usage_limit_per_customer: number | null; used_count: number; is_active: boolean }>(
  `select * from coupons where restaurant_id = $1`,
  [IDS.restaurant],
);

const orderCount = ORDERS.length;
for (const [index, template] of ORDERS.entries()) {
  const createdAt = iso(0, -template.hoursAgo);
  const lines: { item: CatalogueEntry; unitPrice: string; addonsTotal: string; quantity: number; variantName: string | null; addons: { id: string; name: string; groupName: string; price: string; quantity: number }[] }[] = [];

  for (const requested of template.items) {
    const item = catalogue.get(requested.slug);
    if (!item) throw new Error(`unknown seed item ${requested.slug}`);
    const variant = requested.variant ? item.variants.find((candidate) => candidate.name === requested.variant) : item.variants.find(() => false);
    const unitPrice = variant ? variant.price : item.basePrice;
    const addons = (requested.addons ?? []).map((addonName) => {
      for (const group of item.addonGroups) {
        const addon = group.addons.find((candidate) => candidate.name === addonName);
        if (addon) return { id: addon.id, name: addon.name, groupName: group.name, price: addon.price, quantity: 1 };
      }
      throw new Error(`unknown add-on ${addonName} for ${requested.slug}`);
    });
    lines.push({
      item,
      unitPrice,
      addonsTotal: toMoney(addons.reduce((total, addon) => total + Number(addon.price), 0)),
      quantity: requested.quantity,
      variantName: variant?.name ?? null,
      addons,
    });
  }

  const zone = template.zoneId ? zoneRows.find((candidate) => candidate.id === template.zoneId) ?? null : null;
  const couponRow = template.couponCode ? couponRows.find((candidate) => candidate.code === template.couponCode) ?? null : null;

  const pricing = calculatePricing({
    lines: lines.map((line) => ({ unitPrice: line.unitPrice, addonsTotal: line.addonsTotal, quantity: line.quantity })),
    orderType: template.orderType,
    settings,
    zone: zone
      ? {
          id: zone.id, name: zone.name, deliveryFee: zone.delivery_fee,
          minOrderAmount: zone.min_order_amount, freeDeliveryOver: zone.free_delivery_over,
        }
      : null,
    coupon: couponRow
      ? {
          id: couponRow.id, code: couponRow.code, discountType: couponRow.discount_type,
          discountValue: couponRow.discount_value, minOrderAmount: couponRow.min_order_amount,
          maxDiscountAmount: couponRow.max_discount_amount, appliesTo: couponRow.applies_to,
          orderTypes: couponRow.order_types as never, startsAt: couponRow.starts_at, endsAt: couponRow.ends_at,
          usageLimit: couponRow.usage_limit, usageLimitPerCustomer: couponRow.usage_limit_per_customer,
          usedCount: couponRow.used_count, isActive: couponRow.is_active,
        }
      : null,
    now: new Date(createdAt),
  });

  const orderRow = await one<{ id: string; order_number: string }>(
    `insert into orders
       (restaurant_id, location_id, customer_id, order_type, status, customer_name, customer_email, customer_phone,
        delivery_address, delivery_zone_id, table_number, guests, coupon_id, coupon_code, subtotal, discount_amount,
        delivery_fee, tax_amount, service_fee, tip_amount, total, currency, tax_rate, pricing_breakdown, payment_method,
        payment_status, notes, placed_by, created_at, updated_at, estimated_ready_at,
        confirmed_at, ready_at, dispatched_at, completed_at, cancelled_at)
     values ($1,$2,$3,$4::order_type,$5::order_status,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,
             $15::numeric,$16::numeric,$17::numeric,$18::numeric,$19::numeric,$20::numeric,$21::numeric,$22,
             $23::numeric,$24::jsonb,$25::payment_method,$26::payment_status,$27,'customer',$28::timestamptz,
             $28::timestamptz, $29::timestamptz, $30::timestamptz, $31::timestamptz, $32::timestamptz, $33::timestamptz, $34::timestamptz)
     returning id, order_number`,
    [
      IDS.restaurant, template.locationId, template.customerId, template.orderType, template.status,
      template.customerName, template.customerEmail, template.customerPhone,
      template.address ? JSON.stringify(template.address) : null, zone?.id ?? null,
      template.tableNumber ?? null, template.guests ?? null, couponRow?.id ?? null, couponRow?.code ?? null,
      pricing.subtotal, pricing.discount, pricing.deliveryFee, pricing.tax, pricing.serviceFee, pricing.tip, pricing.total,
      BELLA.currency, pricing.taxRate, JSON.stringify({ ...pricing, decimals: undefined }),
      template.paymentMethod, template.paymentStatus, template.notes ?? null, createdAt,
      new Date(new Date(createdAt).getTime() + 25 * 60_000).toISOString(),
      template.status !== "pending" ? new Date(new Date(createdAt).getTime() + 2 * 60_000).toISOString() : null,
      ["ready", "out_for_delivery", "completed"].includes(template.status) ? new Date(new Date(createdAt).getTime() + 18 * 60_000).toISOString() : null,
      ["out_for_delivery", "completed"].includes(template.status) ? new Date(new Date(createdAt).getTime() + 22 * 60_000).toISOString() : null,
      template.status === "completed" ? new Date(new Date(createdAt).getTime() + 52 * 60_000).toISOString() : null,
      template.status === "cancelled" ? new Date(new Date(createdAt).getTime() + 6 * 60_000).toISOString() : null,
    ],
  );
  if (!orderRow) throw new Error("order insert failed");
  const orderId = orderRow.id;

  for (const line of lines) {
    const lineTotal = toMoney(dec(line.unitPrice).plus(dec(line.addonsTotal)).times(line.quantity));
    const itemRow = await one<{ id: string }>(
      `insert into order_items
         (order_id, restaurant_id, menu_item_id, item_name, variant_name, quantity, unit_price, addons_total, line_total, created_at)
       values ($1,$2,$3,$4,$5,$6,$7::numeric,$8::numeric,$9::numeric,$10::timestamptz) returning id`,
      [orderId, IDS.restaurant, line.item.id, line.item.name, line.variantName, line.quantity, line.unitPrice, line.addonsTotal, lineTotal, createdAt],
    );
    if (!itemRow) continue;
    for (const addon of line.addons) {
      await query(
        `insert into order_item_addons (order_item_id, menu_addon_id, group_name, addon_name, unit_price, quantity)
         values ($1,$2,$3,$4,$5::numeric,$6)`,
        [itemRow.id, addon.id, addon.groupName, addon.name, addon.price, addon.quantity],
      );
    }
  }

  // payment record
  await query(
    `insert into payments (restaurant_id, order_id, provider, method, status, amount, currency, created_at, paid_at)
     values ($1,$2,$3,$4::payment_method,$5::payment_status,$6::numeric,$7,$8::timestamptz,
             case when $5 = 'paid' then $8::timestamptz + interval '50 minutes' else null end)`,
    [
      IDS.restaurant,
      orderId,
      template.paymentMethod === "card_terminal" ? "manual" : "cash",
      template.paymentMethod,
      template.paymentStatus,
      pricing.total,
      BELLA.currency,
      createdAt,
    ],
  );

  // delivery record
  if (template.orderType === "delivery") {
    const etaMinutes = zone ? 40 : 45;
    const delivered = template.status === "completed";
    const inTransit = template.status === "out_for_delivery";
    const drivers = [
      { name: "Waqas Ali", phone: "+92 321 4455667" },
      { name: "Noman Bashir", phone: "+92 333 7788990" },
      { name: "Rizwan Khan", phone: "+92 345 2211334" },
    ];
    const driver = template.status === "pending" || template.status === "confirmed" ? null : drivers[index % drivers.length]!;
    await query(
      `insert into deliveries
         (restaurant_id, order_id, location_id, delivery_zone_id, status, driver_name, driver_phone, tracking_url,
          current_latitude, current_longitude, delivery_fee, assigned_at, picked_up_at, estimated_arrival_at, delivered_at)
       values ($1,$2,$3,$4,$5::delivery_status,$6,$7,$8,$9,$10,$11::numeric,$12::timestamptz,$13::timestamptz,$14::timestamptz,$15::timestamptz)`,
      [
        IDS.restaurant, orderId, template.locationId, zone?.id ?? null,
        delivered ? "delivered" : inTransit ? "in_transit" : driver ? "assigned" : "unassigned",
        driver?.name ?? null, driver?.phone ?? null,
        driver ? `https://track.rapido.pk/${orderRow.order_number}` : null,
        inTransit ? 31.4821 : null, inTransit ? 74.3599 : null,
        pricing.deliveryFee,
        driver ? new Date(new Date(createdAt).getTime() + 5 * 60_000).toISOString() : null,
        inTransit || delivered ? new Date(new Date(createdAt).getTime() + 20 * 60_000).toISOString() : null,
        new Date(new Date(createdAt).getTime() + etaMinutes * 60_000).toISOString(),
        delivered ? new Date(new Date(createdAt).getTime() + 48 * 60_000).toISOString() : null,
      ],
    );
  }

  // Status history: rebuild the real progression so the timeline is genuine.
  await query(`delete from order_status_history where order_id = $1`, [orderId]);
  const flow = ["pending", "confirmed", "preparing", "ready"];
  if (template.orderType === "delivery") flow.push("out_for_delivery");
  flow.push("completed");
  const offsets = [0, 2, 9, 18, 22, 48];
  if (template.status === "cancelled") {
    await query(
      `insert into order_status_history (order_id, restaurant_id, from_status, to_status, note, changed_by_name, created_at)
       values ($1,$2,null,'pending','Order placed by customer','customer',$3::timestamptz),
              ($1,$2,'pending','cancelled',$4,'Kamran Yousuf',$5::timestamptz)`,
      [orderId, IDS.restaurant, createdAt, template.notes ?? "Cancelled by staff", new Date(new Date(createdAt).getTime() + 6 * 60_000).toISOString()],
    );
  } else {
    const lastIndex = flow.indexOf(template.status);
    for (let step = 0; step <= lastIndex; step += 1) {
      await query(
        `insert into order_status_history (order_id, restaurant_id, from_status, to_status, note, changed_by_name, created_at)
         values ($1,$2,$3::order_status,$4::order_status,$5,'Kamran Yousuf',$6::timestamptz)`,
        [
          orderId, IDS.restaurant, step === 0 ? null : flow[step - 1], flow[step],
          step === 0 ? "Order placed by customer" : null,
          new Date(new Date(createdAt).getTime() + (offsets[step] ?? step * 5) * 60_000).toISOString(),
        ],
      );
    }
  }

  // coupon usage counts
  if (couponRow) {
    await query(`update coupons set used_count = used_count + 1 where id = $1`, [couponRow.id]);
  }
}

// ---------------------------------------------------------------------------
// 7. Second tenant — proves tenant isolation
// ---------------------------------------------------------------------------
console.log("• inserting second restaurant (isolation fixture)");
await client.query("begin");
await query(
  `insert into restaurants (id, name, slug, description, short_description, cuisines, phone, email, currency,
                            currency_symbol, timezone, country, status, features, settings)
   values ($1,'Sakura Sushi House','sakura-sushi-house','Omakase-style sushi in Karachi.','Sushi bar & izakaya',
           '{Japanese,Sushi}','+92 21 3456 7890','hello@sakura.pk','PKR','Rs','Asia/Karachi','PK','active',$2::jsonb,$3::jsonb)`,
  [SAKURA.restaurant, JSON.stringify({ ...features, delivery: true, dineIn: true }), JSON.stringify(settings)],
);
await query(
  `insert into restaurant_locations (id, restaurant_id, name, slug, is_primary, is_active, address_line1, area, city, latitude, longitude, hours)
   values ($1,$2,'Clifton','clifton',true,true,'Shop 4, Block 4, Clifton','Clifton','Karachi',24.8138,67.0300,$3::jsonb)`,
  [SAKURA.location, SAKURA.restaurant, JSON.stringify(BELLA.hours)],
);
await query(
  `insert into auth.users (id, email, encrypted_password, raw_user_meta_data, email_confirmed_at)
   values ($1,'owner@sakura.pk',$2, jsonb_build_object('name','Hina Sato'::text), now())`,
  [SAKURA.userOwner, await hashPassword("SakuraSushi#1")],
);
await query(
  `insert into team_members (id, restaurant_id, user_id, location_id, email, full_name, role, is_active, accepted_at)
   values ($1,$2,$3,$4,'owner@sakura.pk','Hina Sato','owner',true, now())`,
  [SAKURA.memberOwner, SAKURA.restaurant, SAKURA.userOwner, SAKURA.location],
);
await query(
  `insert into websites (id, restaurant_id, name, status, is_primary, theme, config)
   values ($1,$2,'Sakura website','draft',true,$3::jsonb,'{}'::jsonb)`,
  [SAKURA.website, SAKURA.restaurant, JSON.stringify({ ...BELLA.theme, name: "Ink", primary: "#0F766E", background: "#F8FAF9" })],
);
await query(
  `insert into menu_categories (id, restaurant_id, name, slug, sort_order) values ($1,$2,'Sushi','sushi',1)`,
  [SAKURA.category, SAKURA.restaurant],
);
await query(
  `insert into menu_items (restaurant_id, category_id, name, slug, base_price, description, prep_time_minutes)
   values ($1,$2,'Salmon Nigiri','salmon-nigiri',850,'Two pieces of Hokkaido salmon over seasoned rice.',12),
          ($1,$2,'Dragon Roll','dragon-roll',1450,'Prawn tempura, avocado, unagi glaze.',18)`,
  [SAKURA.restaurant, SAKURA.category],
);
await query(
  `insert into customers (restaurant_id, full_name, email, phone, is_guest)
   values ($1,'Karachi Diner','diner@example.com','+92 300 9998887',true)`,
  [SAKURA.restaurant],
);
await client.query("commit");

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
const counts = await one<{ restaurants: string; items: string; orders: string; customers: string; reviews: string; reservations: string; coupons: string; zones: string }>(
  `select
     (select count(*) from restaurants) as restaurants,
     (select count(*) from menu_items) as items,
     (select count(*) from orders) as orders,
     (select count(*) from customers) as customers,
     (select count(*) from reviews) as reviews,
     (select count(*) from reservations) as reservations,
     (select count(*) from coupons) as coupons,
     (select count(*) from delivery_zones) as zones`,
);
console.log("\n✔ Seed complete");
console.log(`  restaurants ${counts?.restaurants} · menu items ${counts?.items} · orders ${counts?.orders} · customers ${counts?.customers}`);
console.log(`  reviews ${counts?.reviews} · reservations ${counts?.reservations} · coupons ${counts?.coupons} · delivery zones ${counts?.zones}`);
console.log("\n  Storefront : /r/bella-napoli");
console.log("  Admin      : /admin  →  owner@bellanapoli.pk / BellaNapoli#1");
console.log("  Kitchen    : /admin/kitchen (chef@bellanapoli.pk / BellaNapoli#4)\n");
void orderCount;

await client.end();
