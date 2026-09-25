/**
 * Seeds the Zaytoun demo restaurant (Levantine kitchen, Islamabad). Independent of the Bella Napoli seed:
 * it only ever replaces its own tenant, so it can be re-run at any time and never touches other restaurants.
 *
 *   npm run db:seed:zaytoun
 *
 * Images: db/zaytoun/images is the source of truth; Next only serves /public, so the seed copies the folder to
 * public/images/zaytoun (the URLs stored in the database).
 */
import { cpSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { loadEnv } from "../../env";
import { hashPassword } from "../../../../src/server/auth/password";
import { calculatePricing } from "../../../../src/server/domain/pricing";
import { restaurantFeaturesSchema, restaurantSettingsSchema } from "../../../../src/shared/contract/settings";
import { dec, toMoney } from "../../../../src/shared/money";
import {
  ABOUT_SECTIONS, CATEGORIES, CONTACT_SECTIONS, COUPONS, CUSTOMERS, FEATURES, HOME_SECTIONS, IDS, ITEMS, LOCATIONS,
  LOCATIONS_SECTIONS, MEDIA, MENU_SECTIONS, RESERVATION_SECTIONS, REVIEWS_SECTIONS, NAV, ORDERS, RESERVATIONS, RESTAURANT, REVIEWS, SETTINGS, SLUG, TEAM, THEME, WEBSITE_CONFIG, ZONES, cust,
} from "./data";

loadEnv();
const connectionString = process.env.DATABASE_URL_MIGRATOR ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL_MIGRATOR is required");

const settings = restaurantSettingsSchema.parse(SETTINGS);
const features = restaurantFeaturesSchema.parse(FEATURES);
const RID = IDS.restaurant;

console.log("• copying images to public/images/" + SLUG);
cpSync(path.resolve("scripts", "db", SLUG, "images"), path.resolve("public", "images", SLUG), { recursive: true, force: true });

const client = new pg.Client({ connectionString });
await client.connect();

async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await client.query<T>(text, params)).rows;
}
async function one<T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []): Promise<T | null> {
  return (await query<T>(text, params))[0] ?? null;
}
const iso = (daysOffset = 0, hoursOffset = 0): string => new Date(Date.now() + daysOffset * 86_400_000 + hoursOffset * 3_600_000).toISOString();
const after = (base: string, minutes: number): string => new Date(new Date(base).getTime() + minutes * 60_000).toISOString();
const locationId = { f7: IDS.locationF7, greens: IDS.locationGreens } as const;

try {
  // 1. Reset this tenant only (cascades to menu, orders, customers, ...) ------------------------------------
  console.log("• clearing previous Zaytoun data");
  await client.query("begin");
  await client.query(`delete from restaurants where slug = $1`, [SLUG]);
  await client.query(`delete from auth.users where id = any($1::uuid[]) or email = any($2::text[])`, [
    TEAM.map((person) => person.id), TEAM.map((person) => person.email),
  ]);
  await client.query("commit");

  // 2. Restaurant, locations, team, website, pages, media ---------------------------------------------------
  console.log("• inserting restaurant, locations, team, website");
  await client.query("begin");
  await query(
    `insert into restaurants
       (id, name, slug, legal_name, description, short_description, cuisines, phone, whatsapp, email, website_url,
        logo_url, cover_url, primary_color, currency, currency_symbol, locale, timezone, country, status,
        plan, plan_status, features, settings, social, seo)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'en',$17,'PK','active','standard','active',
             $18::jsonb,$19::jsonb,$20::jsonb,$21::jsonb)`,
    [
      RID, RESTAURANT.name, SLUG, RESTAURANT.legalName, RESTAURANT.description, RESTAURANT.shortDescription,
      RESTAURANT.cuisines, RESTAURANT.phone, RESTAURANT.whatsapp, RESTAURANT.email, RESTAURANT.websiteUrl,
      RESTAURANT.logo, RESTAURANT.cover, THEME.primary, RESTAURANT.currency, RESTAURANT.currencySymbol, RESTAURANT.timezone,
      JSON.stringify(features), JSON.stringify(settings), JSON.stringify(RESTAURANT.social),
      JSON.stringify({ title: `${RESTAURANT.name} — ${RESTAURANT.tagline} in Islamabad`, description: RESTAURANT.shortDescription }),
    ],
  );

  for (const [index, location] of LOCATIONS.entries()) {
    await query(
      `insert into restaurant1s
         (id, restaurant_id, name, slug, is_primary, is_active, address_line1, area, city, state, postal_code, country,
          phone, email, latitude, longitude, hours, settings, sort_order)
       values ($1,$2,$3,$4,$5,true,$6,$7,$8,$9,$10,'PK',$11,$12,$13,$14,$15::jsonb,$16::jsonb,$17)`,
      [
        location.id, RID, location.name, location.slug, location.primary, location.line1, location.area, location.city,
        location.state, location.postalCode, location.phone, RESTAURANT.email, location.latitude, location.longitude,
        JSON.stringify(location.hours), JSON.stringify(location.settings), index + 1,
      ],
    );
  }

  for (const person of TEAM) {
    await query(
      `insert into auth.users (id, email, encrypted_password, raw_user_meta_data, email_confirmed_at)
       values ($1,$2,$3, jsonb_build_object('name', $4::text), now())`,
      [person.id, person.email, await hashPassword(person.password), person.name],
    );
    await query(
      `insert into team_members
         (id, restaurant_id, user_id, location_id, email, full_name, phone, role, permissions, is_active, accepted_at, last_login_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8::team_role,'{}'::jsonb,true, now(), now() - interval '2 hours')`,
      [person.member, RID, person.id, IDS.locationF7, person.email, person.name, person.phone, person.role],
    );
  }

  await query(
    `insert into websites (id, restaurant_id, name, subdomain, status, is_primary, theme, config, seo, published_at)
     values ($1,$2,$3,$4,'published',true,$5::jsonb,$6::jsonb,$7::jsonb, now() - interval '40 days')`,
    [
      IDS.website, RID, RESTAURANT.name, SLUG, JSON.stringify(THEME),
      JSON.stringify({ ...WEBSITE_CONFIG, navigation: { ...WEBSITE_CONFIG.navigation, items: NAV } }),
      JSON.stringify({ title: `${RESTAURANT.name} — ${RESTAURANT.tagline} in Islamabad` }),
    ],
  );

  const pages = [
    { id: IDS.pageHome, slug: "home", title: "Home", description: RESTAURANT.shortDescription, isHome: true, sections: HOME_SECTIONS, sort: 1 },
    { id: IDS.pageAbout, slug: "about", title: "Our story", description: "How Zaytoun brought Levantine grill cooking to Islamabad.", isHome: false, sections: ABOUT_SECTIONS, sort: 2 },
    { id: IDS.pageContact, slug: "contact", title: "Contact", description: "Reach the Zaytoun team.", isHome: false, sections: CONTACT_SECTIONS, sort: 3 },
    { id: IDS.pageMenu, slug: "menu", title: "Menu", description: "Browse the Zaytoun menu: mezze, charcoal grill, signature plates, sweets and drinks.", isHome: false, sections: MENU_SECTIONS, sort: 4 },
    { id: IDS.pageReservation, slug: "reservation", title: "Book a table", description: "Reserve a table at Zaytoun. Live availability, instant confirmation.", isHome: false, sections: RESERVATION_SECTIONS, sort: 5 },
    { id: IDS.pageReviews, slug: "reviews", title: "Reviews", description: "What guests say about Zaytoun.", isHome: false, sections: REVIEWS_SECTIONS, sort: 6 },
    { id: IDS.pageLocations, slug: "locations", title: "Locations", description: "Addresses, opening hours and phone numbers for both Zaytoun kitchens.", isHome: false, sections: LOCATIONS_SECTIONS, sort: 7 },
  ];
  for (const page of pages) {
    await query(
      `insert into website_pages (id, website_id, restaurant_id, slug, title, description, is_home, is_published, sort_order, sections, seo)
       values ($1,$2,$3,$4,$5,$6,$7,true,$8,$9::jsonb,$10::jsonb)`,
      [page.id, IDS.website, RID, page.slug, page.title, page.description, page.isHome, page.sort, JSON.stringify(page.sections), JSON.stringify({ title: page.title })],
    );
  }

  for (const [url, fileName, purpose, width, height] of MEDIA) {
    await query(
      `insert into media (restaurant_id, bucket, path, url, file_name, mime_type, size_bytes, width, height, purpose, alt_text)
       values ($1,'restaurant-media',$2,$3,$2,$4,0,$5,$6,$7::media_purpose,$8)`,
      [RID, `${SLUG}/${fileName}`, url, fileName.endsWith(".svg") ? "image/svg+xml" : "image/jpeg", width, height, purpose, fileName.replace(/[-.]/g, " ")],
    );
  }
  await client.query("commit");

  // 3. Menu, delivery zones, coupons ------------------------------------------------------------------------
  console.log("• inserting menu, delivery zones, coupons");
  await client.query("begin");
  const categoryIdBySlug = new Map<string, string>();
  for (const [index, category] of CATEGORIES.entries()) {
    const row = await one<{ id: string }>(
      `insert into menu_categories (restaurant_id, name, slug, description, image_url, icon, sort_order, is_active, is_featured)
       values ($1,$2,$3,$4,$5,$6,$7,true,$8) returning id`,
      [RID, category.name, category.slug, category.description, category.image, category.icon, index + 1, category.featured ?? false],
    );
    categoryIdBySlug.set(category.slug, row!.id);
  }

  const itemIdBySlug = new Map<string, string>();
  for (const [index, item] of ITEMS.entries()) {
    const categoryId = categoryIdBySlug.get(item.category);
    if (!categoryId) throw new Error(`unknown category ${item.category} on ${item.slug}`);
    const row = await one<{ id: string }>(
      `insert into menu_items
         (restaurant_id, category_id, name, slug, description, short_description, image_url, base_price, compare_at_price,
          calories, spice_level, prep_time_minutes, is_active, is_available, is_featured, dietary_tags, allergens, sort_order)
       values ($1,$2,$3,$4,$5,$6,$7,$8::numeric,$9::numeric,$10,$11,$12,true,true,$13,$14,$15,$16) returning id`,
      [
        RID, categoryId, item.name, item.slug, item.description, item.shortDescription ?? null, item.image, item.price,
        item.compareAtPrice ?? null, item.calories ?? null, item.spiceLevel ?? 0, item.prepTime, item.featured ?? false,
        item.dietaryTags ?? [], item.allergens ?? [], index + 1,
      ],
    );
    itemIdBySlug.set(item.slug, row!.id);
    for (const [i, variant] of (item.variants ?? []).entries()) {
      await query(
        `insert into menu_item_variants (restaurant_id, menu_item_id, name, price, price_mode, is_default, is_available, sort_order)
         values ($1,$2,$3,$4::numeric,'absolute',$5,true,$6)`,
        [RID, row!.id, variant.name, variant.price, variant.isDefault ?? false, i + 1],
      );
    }
    for (const [g, group] of (item.addonGroups ?? []).entries()) {
      const groupRow = await one<{ id: string }>(
        `insert into menu_addon_groups (restaurant_id, menu_item_id, name, is_required, min_select, max_select, sort_order, is_active)
         values ($1,$2,$3,$4,$5,$6,$7,true) returning id`,
        [RID, row!.id, group.name, group.isRequired ?? false, group.minSelect ?? (group.isRequired ? 1 : 0), group.maxSelect ?? 1, g + 1],
      );
      for (const [a, addon] of group.addons.entries()) {
        await query(
          `insert into menu_addons (restaurant_id, addon_group_id, name, price, is_default, is_available, max_quantity, sort_order)
           values ($1,$2,$3,$4::numeric,$5,true,$6,$7)`,
          [RID, groupRow!.id, addon.name, addon.price, addon.isDefault ?? false, addon.maxQuantity ?? 1, a + 1],
        );
      }
    }
  }

  for (const [index, zone] of ZONES.entries()) {
    await query(
      `insert into delivery_zones
         (id, restaurant_id, location_id, name, description, areas, postal_codes, delivery_fee, min_order_amount,
          free_delivery_over, eta_min_minutes, eta_max_minutes, is_active, sort_order)
       values ($1,$2,$3,$4,$5,$6,$7,$8::numeric,$9::numeric,$10::numeric,$11,$12,true,$13)`,
      [zone.id, RID, zone.locationId, zone.name, ("description" in zone ? zone.description : null) ?? null, zone.areas, zone.postalCodes, zone.fee, zone.minOrder, zone.freeOver, zone.etaMin, zone.etaMax, index + 1],
    );
  }

  for (const coupon of COUPONS) {
    await query(
      `insert into coupons
         (id, restaurant_id, code, description, discount_type, discount_value, min_order_amount, max_discount_amount,
          applies_to, order_types, starts_at, ends_at, usage_limit, usage_limit_per_customer, is_active)
       values ($1,$2,$3,$4,$5::coupon_discount_type,$6::numeric,$7::numeric,$8::numeric,$9,
               '{delivery,pickup,dine_in}'::order_type[], $10::timestamptz, $11::timestamptz, $12, $13, $14)`,
      [coupon.id, RID, coupon.code, coupon.description, coupon.type, coupon.value, coupon.minOrder, coupon.maxDiscount, coupon.appliesTo, iso(coupon.startsAt), iso(coupon.endsAt), coupon.usageLimit, coupon.perCustomer, coupon.active],
    );
  }
  await client.query("commit");

  // 4. Customers, reviews, reservations ---------------------------------------------------------------------
  console.log("• inserting customers, reviews, reservations");
  await client.query("begin");
  const accountHash = await hashPassword("DinerPass#1");
  for (const person of CUSTOMERS) {
    await query(
      `insert into customers (id, restaurant_id, full_name, email, phone, is_guest, marketing_opt_in, password_hash, is_email_verified)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [person.id, RID, person.name, person.email, person.phone, !person.account, person.account, person.account ? accountHash : null, person.account],
    );
    await query(
      `insert into customer_addresses
         (restaurant_id, customer_id, label, phone, address_line1, area, city, postal_code, country, is_default)
       values ($1,$2,$3,$4,$5,$6,$7,'44000','PK',true)`,
      [RID, person.id, person.address.label, person.phone, person.address.line1, person.address.area, person.address.city],
    );
  }

  for (const review of REVIEWS) {
    await query(
      `insert into reviews (restaurant_id, customer_id, menu_item_id, author_name, rating, title, comment, status, is_featured, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8::review_status,$9,$10::timestamptz)`,
      [
        RID, review.customer ? cust(review.customer).id : null, itemIdBySlug.get(review.itemSlug) ?? null, review.author,
        review.rating, review.title, review.comment, review.status, review.featured, iso(-review.daysAgo),
      ],
    );
  }

  for (const [index, reservation] of RESERVATIONS.entries()) {
    const person = cust(reservation.customer);
    const date = new Date(Date.now() + reservation.daysAhead * 86_400_000);
    await query(
      `insert into reservations
         (restaurant_id, location_id, customer_id, confirmation_code, guest_name, guest_email, guest_phone,
          reservation_date, reservation_time, duration_minutes, guests, table_number, special_requests, occasion, status, created_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8::date,$9::time,105,$10,$11,$12,$13,$14::reservation_status,$15::timestamptz)`,
      [
        RID, index % 3 === 2 ? IDS.locationGreens : IDS.locationF7, person.id, `ZK-${(2041 + index * 7).toString().padStart(4, "0")}`,
        person.name, person.email, person.phone, date.toISOString().slice(0, 10), reservation.time, reservation.guests,
        reservation.table, reservation.requests, reservation.occasion, reservation.status, iso(reservation.daysAhead - 4),
      ],
    );
  }
  await client.query("commit");

  // 5. Orders — priced by the real engine -------------------------------------------------------------------
  console.log("• inserting orders (pricing through the real engine)");
  interface Catalogue {
    id: string; name: string; basePrice: string;
    variants: { name: string; price: string }[];
    addons: { id: string; name: string; groupName: string; price: string }[];
  }
  const catalogue = new Map<string, Catalogue>();
  for (const item of await query<{ id: string; slug: string; name: string; base_price: string }>(`select id, slug, name, base_price from menu_items where restaurant_id = $1`, [RID])) {
    catalogue.set(item.slug, { id: item.id, name: item.name, basePrice: item.base_price, variants: [], addons: [] });
  }
  const byId = new Map([...catalogue.values()].map((entry) => [entry.id, entry]));
  for (const v of await query<{ menu_item_id: string; name: string; price: string }>(`select menu_item_id, name, price from menu_item_variants where restaurant_id = $1`, [RID])) {
    byId.get(v.menu_item_id)?.variants.push({ name: v.name, price: v.price });
  }
  for (const a of await query<{ id: string; menu_item_id: string; name: string; price: string; group_name: string }>(
    `select a.id, g.menu_item_id, a.name, a.price, g.name as group_name
       from menu_addons a join menu_addon_groups g on g.id = a.addon_group_id where a.restaurant_id = $1`, [RID])) {
    byId.get(a.menu_item_id)?.addons.push({ id: a.id, name: a.name, groupName: a.group_name, price: a.price });
  }

  const zoneRows = await query<{ id: string; name: string; delivery_fee: string; min_order_amount: string; free_delivery_over: string | null }>(
    `select id, name, delivery_fee, min_order_amount, free_delivery_over from delivery_zones where restaurant_id = $1`, [RID]);
  const couponRows = await query<{ id: string; code: string; discount_type: "percentage" | "fixed"; discount_value: string; min_order_amount: string; max_discount_amount: string | null; applies_to: "order" | "delivery_fee"; order_types: string[]; starts_at: string; ends_at: string; usage_limit: number | null; usage_limit_per_customer: number | null; used_count: number; is_active: boolean }>(
    `select * from coupons where restaurant_id = $1`, [RID]);
  const drivers = [
    { name: "Waqar Hussain", phone: "+92 321 5566771" },
    { name: "Nadeem Abbasi", phone: "+92 333 5566772" },
    { name: "Rizwan Malik", phone: "+92 345 5566773" },
  ];

  for (const [index, template] of ORDERS.entries()) {
    const person = cust(template.customer);
    const createdAt = iso(0, -template.hoursAgo);
    const lines = template.items.map((requested) => {
      const item = catalogue.get(requested.slug);
      if (!item) throw new Error(`unknown seed item ${requested.slug}`);
      const variant = requested.variant ? item.variants.find((candidate) => candidate.name === requested.variant) : undefined;
      if (requested.variant && !variant) throw new Error(`unknown variant ${requested.variant} for ${requested.slug}`);
      const addons = (requested.addons ?? []).map((name) => {
        const addon = item.addons.find((candidate) => candidate.name === name);
        if (!addon) throw new Error(`unknown add-on ${name} for ${requested.slug}`);
        return addon;
      });
      return {
        item, variantName: variant?.name ?? null, unitPrice: variant?.price ?? item.basePrice, quantity: requested.quantity, addons,
        addonsTotal: toMoney(addons.reduce((total, addon) => total + Number(addon.price), 0)),
      };
    });

    const zone = template.zoneId ? zoneRows.find((candidate) => candidate.id === template.zoneId) ?? null : null;
    const couponRow = template.couponCode ? couponRows.find((candidate) => candidate.code === template.couponCode) ?? null : null;
    const pricing = calculatePricing({
      lines: lines.map((line) => ({ unitPrice: line.unitPrice, addonsTotal: line.addonsTotal, quantity: line.quantity })),
      orderType: template.orderType,
      settings,
      zone: zone ? { id: zone.id, name: zone.name, deliveryFee: zone.delivery_fee, minOrderAmount: zone.min_order_amount, freeDeliveryOver: zone.free_delivery_over } : null,
      coupon: couponRow
        ? {
            id: couponRow.id, code: couponRow.code, discountType: couponRow.discount_type, discountValue: couponRow.discount_value,
            minOrderAmount: couponRow.min_order_amount, maxDiscountAmount: couponRow.max_discount_amount, appliesTo: couponRow.applies_to,
            orderTypes: couponRow.order_types as never, startsAt: couponRow.starts_at, endsAt: couponRow.ends_at,
            usageLimit: couponRow.usage_limit, usageLimitPerCustomer: couponRow.usage_limit_per_customer, usedCount: couponRow.used_count, isActive: couponRow.is_active,
          }
        : null,
      now: new Date(createdAt),
    });

    const status = template.status;
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
               $28::timestamptz,$29::timestamptz,$30::timestamptz,$31::timestamptz,$32::timestamptz,$33::timestamptz,$34::timestamptz)
       returning id, order_number`,
      [
        RID, locationId[template.location], person.id, template.orderType, status, person.name, person.email, person.phone,
        template.orderType === "delivery" ? JSON.stringify({ line1: person.address.line1, area: person.address.area, city: person.address.city }) : null,
        zone?.id ?? null, template.tableNumber ?? null, template.guests ?? null, couponRow?.id ?? null, couponRow?.code ?? null,
        pricing.subtotal, pricing.discount, pricing.deliveryFee, pricing.tax, pricing.serviceFee, pricing.tip, pricing.total,
        RESTAURANT.currency, pricing.taxRate, JSON.stringify({ ...pricing, decimals: undefined }),
        template.paymentMethod, template.paymentStatus, template.notes ?? null, createdAt, after(createdAt, 25),
        status !== "pending" ? after(createdAt, 2) : null,
        ["ready", "out_for_delivery", "completed"].includes(status) ? after(createdAt, 18) : null,
        ["out_for_delivery", "completed"].includes(status) ? after(createdAt, 22) : null,
        status === "completed" ? after(createdAt, 52) : null,
        status === "cancelled" ? after(createdAt, 6) : null,
      ],
    );
    if (!orderRow) throw new Error("order insert failed");

    for (const line of lines) {
      const lineTotal = toMoney(dec(line.unitPrice).plus(dec(line.addonsTotal)).times(line.quantity));
      const itemRow = await one<{ id: string }>(
        `insert into order_items (order_id, restaurant_id, menu_item_id, item_name, variant_name, quantity, unit_price, addons_total, line_total, created_at)
         values ($1,$2,$3,$4,$5,$6,$7::numeric,$8::numeric,$9::numeric,$10::timestamptz) returning id`,
        [orderRow.id, RID, line.item.id, line.item.name, line.variantName, line.quantity, line.unitPrice, line.addonsTotal, lineTotal, createdAt],
      );
      for (const addon of line.addons) {
        await query(
          `insert into order_item_addons (order_item_id, menu_addon_id, group_name, addon_name, unit_price, quantity) values ($1,$2,$3,$4,$5::numeric,1)`,
          [itemRow!.id, addon.id, addon.groupName, addon.name, addon.price],
        );
      }
    }

    await query(
      `insert into payments (restaurant_id, order_id, provider, method, status, amount, currency, created_at, paid_at)
       values ($1,$2,$3,$4::payment_method,$5::payment_status,$6::numeric,$7,$8::timestamptz,
               case when $5 = 'paid' then $8::timestamptz + interval '50 minutes' else null end)`,
      [RID, orderRow.id, template.paymentMethod === "card_terminal" ? "manual" : "cash", template.paymentMethod, template.paymentStatus, pricing.total, RESTAURANT.currency, createdAt],
    );

    if (template.orderType === "delivery") {
      const delivered = status === "completed";
      const inTransit = status === "out_for_delivery";
      const driver = status === "pending" || status === "confirmed" || status === "cancelled" ? null : drivers[index % drivers.length]!;
      await query(
        `insert into deliveries
           (restaurant_id, order_id, location_id, delivery_zone_id, status, driver_name, driver_phone, tracking_url,
            current_latitude, current_longitude, delivery_fee, assigned_at, picked_up_at, estimated_arrival_at, delivered_at)
         values ($1,$2,$3,$4,$5::delivery_status,$6,$7,$8,$9,$10,$11::numeric,$12::timestamptz,$13::timestamptz,$14::timestamptz,$15::timestamptz)`,
        [
          RID, orderRow.id, locationId[template.location], zone?.id ?? null,
          delivered ? "delivered" : inTransit ? "in_transit" : driver ? "assigned" : "unassigned",
          driver?.name ?? null, driver?.phone ?? null, driver ? `https://track.zaytoun.pk/${orderRow.order_number}` : null,
          inTransit ? 33.7182 : null, inTransit ? 73.0611 : null, pricing.deliveryFee,
          driver ? after(createdAt, 5) : null, inTransit || delivered ? after(createdAt, 20) : null,
          after(createdAt, 40), delivered ? after(createdAt, 48) : null,
        ],
      );
    }

    // Status history: rebuild the real progression so the timeline is genuine.
    await query(`delete from order_status_history where order_id = $1`, [orderRow.id]);
    if (status === "cancelled") {
      await query(
        `insert into order_status_history (order_id, restaurant_id, from_status, to_status, note, changed_by_name, created_at)
         values ($1,$2,null,'pending','Order placed by customer','customer',$3::timestamptz),
                ($1,$2,'pending','cancelled',$4,'Hira Zafar',$5::timestamptz)`,
        [orderRow.id, RID, createdAt, template.notes ?? "Cancelled by staff", after(createdAt, 6)],
      );
    } else {
      const flow = ["pending", "confirmed", "preparing", "ready", ...(template.orderType === "delivery" ? ["out_for_delivery"] : []), "completed"];
      const offsets = [0, 2, 9, 18, 22, 48];
      for (let step = 0; step <= flow.indexOf(status); step += 1) {
        await query(
          `insert into order_status_history (order_id, restaurant_id, from_status, to_status, note, changed_by_name, created_at)
           values ($1,$2,$3::order_status,$4::order_status,$5,'Hira Zafar',$6::timestamptz)`,
          [orderRow.id, RID, step === 0 ? null : flow[step - 1], flow[step], step === 0 ? "Order placed by customer" : null, after(createdAt, offsets[step] ?? step * 5)],
        );
      }
    }
    if (couponRow) await query(`update coupons set used_count = used_count + 1 where id = $1`, [couponRow.id]);
  }

  // Seeded orders are history, not live: drop the notification events their triggers queued (this tenant only).
  await query(`delete from notification_events where restaurant_id = $1`, [RID]);

  const counts = await one<Record<string, string>>(
    `select (select count(*) from menu_categories where restaurant_id = $1) as categories,
            (select count(*) from menu_items where restaurant_id = $1) as items,
            (select count(*) from orders where restaurant_id = $1) as orders,
            (select count(*) from customers where restaurant_id = $1) as customers,
            (select count(*) from reviews where restaurant_id = $1) as reviews,
            (select count(*) from reservations where restaurant_id = $1) as reservations,
            (select count(*) from coupons where restaurant_id = $1) as coupons,
            (select count(*) from delivery_zones where restaurant_id = $1) as zones`,
    [RID],
  );
  console.log(`\n✔ Zaytoun seed complete`);
  console.log(`  categories ${counts?.categories} · items ${counts?.items} · orders ${counts?.orders} · customers ${counts?.customers}`);
  console.log(`  reviews ${counts?.reviews} · reservations ${counts?.reservations} · coupons ${counts?.coupons} · zones ${counts?.zones}`);
  console.log(`\n  Storefront : /r/${SLUG}   (run the app with NEXT_PUBLIC_DEFAULT_RESTAURANT=${SLUG})`);
  console.log(`  Admin      : /admin  →  ${TEAM[0]!.email} / ${TEAM[0]!.password}\n`);
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
