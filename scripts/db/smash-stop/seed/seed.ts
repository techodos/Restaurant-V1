/**
 * Seeds Smash Stop — a fictional one-branch burger kiosk (Karachi) on WhatsApp checkout: the test restaurant for
 * the WhatsApp-ordering feature (restaurants.checkout_mode = 'whatsapp', migration 0043). It borrows Bun Intended's
 * look, website sections, menu and images (public/images/bun-intended, already in the repo) under its own name and
 * ids, and only ever replaces its own tenant, so it can be re-run any time without touching other restaurants.
 *
 *   npm run db:seed:smash-stop                 (SEED_WHATSAPP="+92 3xx xxxxxxx" to receive the test orders yourself)
 *
 * No historic orders, reviews or reservations: it starts empty, like a newly onboarded small restaurant.
 */
import pg from "pg";
import { loadEnv } from "../../env";
import { hashPassword } from "../../../../src/server/auth/password";
import { restaurantFeaturesSchema, restaurantSettingsSchema } from "../../../../src/shared/contract/settings";
import { normalizeWhatsAppNumber } from "../../../../src/shared/whatsapp-order";
import * as bun from "../../bun-intended/seed/data";

loadEnv();
const connectionString = process.env.DATABASE_URL_MIGRATOR ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL_MIGRATOR is required");

const SLUG = "smash-stop";
const NAME = "Smash Stop";
const uid = (group: number, n: number): string => `5a5a${group.toString(16).padStart(4, "0")}-eeee-4eee-8eee-${n.toString().padStart(12, "0")}`;
const IDS = {
  restaurant: uid(1, 1),
  location: uid(2, 1),
  website: uid(3, 1),
  pageHome: uid(4, 1),
  pageAbout: uid(4, 2),
  pageContact: uid(4, 3),
  pageMenu: uid(4, 4),
  pageLocations: uid(4, 7),
  zoneA: uid(5, 1),
  zoneB: uid(5, 2),
  memberOwner: uid(7, 1),
  userOwner: uid(8, 1),
};
/** placeholder until someone sets the real one (admin → Settings → WhatsApp, or super admin → Checkout) */
const WHATSAPP = normalizeWhatsAppNumber(process.env.SEED_WHATSAPP ?? "+92 300 1234567") || "+923001234567";
const OWNER = { email: "owner@smashstop.pk", password: "SmashStop#1", name: "Hamza Qureshi", phone: "+92 300 3330001" };

/** Re-brand borrowed content: every "Bun Intended" string becomes "Smash Stop" (deep, JSON-safe). */
function rebrand<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value)
      .replace(/Bun Intended/g, NAME)
      .replace(/bunintended\.pk/g, "smashstop.pk")
      .replace(/@bunintended/g, "@smashstop"),
  ) as T;
}

const settings = restaurantSettingsSchema.parse({
  ...bun.SETTINGS,
  // WhatsApp checkout settles in cash; nothing online to configure for a portal-less restaurant
  payments: { enabledMethods: ["cash_on_delivery", "cash"], onlineProvider: "none", payAtStoreEnabled: true },
  receipt: { footerNote: `Thanks for ordering from ${NAME}!`, showTaxNumber: false },
});
const features = restaurantFeaturesSchema.parse({ ...bun.FEATURES, dineIn: false, coupons: false, gallery: false, reviews: false });
const branch = { ...bun.LOCATIONS[0]!, id: IDS.location, name: "Clifton Kiosk", slug: "clifton-kiosk" };
const zones = bun.ZONES.filter((zone) => zone.locationId === bun.IDS.locationClifton).map((zone, index) => ({
  ...zone,
  id: index === 0 ? IDS.zoneA : IDS.zoneB,
  locationId: IDS.location,
}));
const nav = bun.NAV.filter((item) => !item.href.endsWith("/reviews"));

const client = new pg.Client({ connectionString });
await client.connect();
const query = async <T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []) => (await client.query<T>(text, params)).rows;
const one = async <T extends pg.QueryResultRow = pg.QueryResultRow>(text: string, params: unknown[] = []) => (await query<T>(text, params))[0] ?? null;

try {
  console.log(`• clearing previous ${NAME} data`);
  await client.query("begin");
  await client.query(`delete from restaurants where slug = $1`, [SLUG]);
  await client.query(`delete from auth.users where id = $1 or email = $2`, [IDS.userOwner, OWNER.email]);
  await client.query("commit");

  console.log("• inserting restaurant (WhatsApp checkout), branch, owner, website");
  await client.query("begin");
  await query(
    `insert into restaurants
       (id, name, slug, legal_name, description, short_description, cuisines, phone, whatsapp, email, website_url,
        logo_url, cover_url, primary_color, currency, currency_symbol, locale, timezone, country, status,
        plan, plan_status, features, settings, social, seo, checkout_mode)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,null,$11,$12,$13,'PKR','Rs','en','Asia/Karachi','PK','active','standard','active',
             $14::jsonb,$15::jsonb,'{}'::jsonb,$16::jsonb,'whatsapp')`,
    [
      IDS.restaurant, NAME, SLUG, `${NAME} Foods`,
      `${NAME} is a one-counter smash-burger kiosk in Clifton. Order on the website, send it on WhatsApp, and we'll have it hot in minutes.`,
      "Smash burgers, crispy chicken and fries — order online, confirm on WhatsApp.",
      bun.RESTAURANT.cuisines, "+92 21 3587 0999", WHATSAPP, "hello@smashstop.pk",
      /* no logo file of its own: the header shows the name */ null, bun.RESTAURANT.cover, bun.THEME.primary,
      JSON.stringify(features), JSON.stringify(settings), JSON.stringify({ title: `${NAME} — Smash burgers · Karachi`, description: "Order online, confirm on WhatsApp." }),
    ],
  );
  await query(
    `insert into restaurant1s
       (id, restaurant_id, name, slug, is_primary, is_active, address_line1, area, city, state, postal_code, country,
        phone, email, latitude, longitude, hours, settings, sort_order)
     values ($1,$2,$3,$4,true,true,$5,$6,$7,$8,$9,'PK',$10,$11,$12,$13,$14::jsonb,$15::jsonb,1)`,
    [IDS.location, IDS.restaurant, branch.name, branch.slug, branch.line1, branch.area, branch.city, branch.state, branch.postalCode,
     branch.phone, "hello@smashstop.pk", branch.latitude, branch.longitude, JSON.stringify(branch.hours), JSON.stringify(branch.settings)],
  );
  await query(
    `insert into auth.users (id, email, encrypted_password, raw_user_meta_data, email_confirmed_at)
     values ($1,$2,$3, jsonb_build_object('name', $4::text), now())`,
    [IDS.userOwner, OWNER.email, await hashPassword(OWNER.password), OWNER.name],
  );
  await query(
    `insert into team_members (id, restaurant_id, user_id, location_id, email, full_name, phone, role, permissions, is_active, accepted_at)
     values ($1,$2,$3,null,$4,$5,$6,'owner','{}'::jsonb,true, now())`,
    [IDS.memberOwner, IDS.restaurant, IDS.userOwner, OWNER.email, OWNER.name, OWNER.phone],
  );
  await query(
    `insert into websites (id, restaurant_id, name, subdomain, status, is_primary, theme, config, seo, published_at)
     values ($1,$2,$3,$4,'published',true,$5::jsonb,$6::jsonb,$7::jsonb, now())`,
    [IDS.website, IDS.restaurant, NAME, SLUG, JSON.stringify(bun.THEME),
     // Bun Intended's promo banner names a coupon this kiosk does not have
     JSON.stringify(rebrand({ ...bun.WEBSITE_CONFIG, announcement: { ...(bun.WEBSITE_CONFIG as { announcement?: object }).announcement, enabled: false }, navigation: { ...bun.WEBSITE_CONFIG.navigation, items: nav } })),
     JSON.stringify({ title: `${NAME} — Smash burgers · Karachi` })],
  );
  const pages = [
    { id: IDS.pageHome, slug: "home", title: "Home", isHome: true, sections: bun.HOME_SECTIONS, sort: 1 },
    { id: IDS.pageAbout, slug: "about", title: "Our story", isHome: false, sections: bun.ABOUT_SECTIONS, sort: 2 },
    { id: IDS.pageContact, slug: "contact", title: "Contact", isHome: false, sections: bun.CONTACT_SECTIONS, sort: 3 },
    { id: IDS.pageMenu, slug: "menu", title: "Menu", isHome: false, sections: bun.MENU_SECTIONS, sort: 4 },
    { id: IDS.pageLocations, slug: "locations", title: "Locations", isHome: false, sections: bun.LOCATIONS_SECTIONS, sort: 5 },
  ];
  for (const page of pages) {
    await query(
      `insert into website_pages (id, website_id, restaurant_id, slug, title, description, is_home, is_published, sort_order, sections, seo)
       values ($1,$2,$3,$4,$5,$6,$7,true,$8,$9::jsonb,$10::jsonb)`,
      [page.id, IDS.website, IDS.restaurant, page.slug, page.title, `${NAME} — ${page.title}`, page.isHome, page.sort,
       JSON.stringify(rebrand(page.sections)), JSON.stringify({ title: page.title })],
    );
  }
  await client.query("commit");

  console.log("• inserting menu and delivery zones");
  await client.query("begin");
  const categoryIdBySlug = new Map<string, string>();
  for (const [index, category] of bun.CATEGORIES.entries()) {
    const row = await one<{ id: string }>(
      `insert into menu_categories (restaurant_id, name, slug, description, image_url, icon, sort_order, is_active, is_featured)
       values ($1,$2,$3,$4,$5,$6,$7,true,$8) returning id`,
      [IDS.restaurant, category.name, category.slug, category.description, category.image, category.icon, index + 1, category.featured ?? false],
    );
    categoryIdBySlug.set(category.slug, row!.id);
  }
  for (const [index, item] of bun.ITEMS.entries()) {
    const row = await one<{ id: string }>(
      `insert into menu_items
         (restaurant_id, category_id, name, slug, description, short_description, image_url, base_price, compare_at_price,
          calories, spice_level, prep_time_minutes, is_active, is_available, is_featured, dietary_tags, allergens, sort_order)
       values ($1,$2,$3,$4,$5,$6,$7,$8::numeric,$9::numeric,$10,$11,$12,true,true,$13,$14,$15,$16) returning id`,
      [IDS.restaurant, categoryIdBySlug.get(item.category), item.name, item.slug, rebrand(item.description), item.shortDescription ?? null,
       item.image, item.price, item.compareAtPrice ?? null, item.calories ?? null, item.spiceLevel ?? 0, item.prepTime,
       item.featured ?? false, item.dietaryTags ?? [], item.allergens ?? [], index + 1],
    );
    for (const [i, variant] of (item.variants ?? []).entries()) {
      await query(
        `insert into menu_item_variants (restaurant_id, menu_item_id, name, price, price_mode, is_default, is_available, sort_order)
         values ($1,$2,$3,$4::numeric,'absolute',$5,true,$6)`,
        [IDS.restaurant, row!.id, variant.name, variant.price, variant.isDefault ?? false, i + 1],
      );
    }
    for (const [g, group] of (item.addonGroups ?? []).entries()) {
      const groupRow = await one<{ id: string }>(
        `insert into menu_addon_groups (restaurant_id, menu_item_id, name, is_required, min_select, max_select, sort_order, is_active)
         values ($1,$2,$3,$4,$5,$6,$7,true) returning id`,
        [IDS.restaurant, row!.id, group.name, group.isRequired ?? false, group.minSelect ?? (group.isRequired ? 1 : 0), group.maxSelect ?? 1, g + 1],
      );
      for (const [a, addon] of group.addons.entries()) {
        await query(
          `insert into menu_addons (restaurant_id, addon_group_id, name, price, is_default, is_available, max_quantity, sort_order)
           values ($1,$2,$3,$4::numeric,$5,true,$6,$7)`,
          [IDS.restaurant, groupRow!.id, addon.name, addon.price, addon.isDefault ?? false, addon.maxQuantity ?? 1, a + 1],
        );
      }
    }
  }
  for (const [index, zone] of zones.entries()) {
    await query(
      `insert into delivery_zones
         (id, restaurant_id, location_id, name, description, areas, postal_codes, delivery_fee, min_order_amount,
          free_delivery_over, eta_min_minutes, eta_max_minutes, is_active, sort_order)
       values ($1,$2,$3,$4,$5,$6,$7,$8::numeric,$9::numeric,$10::numeric,$11,$12,true,$13)`,
      [zone.id, IDS.restaurant, zone.locationId, zone.name, ("description" in zone ? zone.description : null) ?? null, zone.areas,
       zone.postalCodes, zone.fee, zone.minOrder, zone.freeOver, zone.etaMin, zone.etaMax, index + 1],
    );
  }
  await client.query("commit");

  const counts = await one<Record<string, string>>(
    `select (select count(*) from menu_items where restaurant_id = $1) as items,
            (select count(*) from delivery_zones where restaurant_id = $1) as zones,
            (select checkout_mode from restaurants where id = $1) as mode,
            (select whatsapp from restaurants where id = $1) as whatsapp`,
    [IDS.restaurant],
  );
  console.log(`\n✔ ${NAME} seed complete — items ${counts?.items} · zones ${counts?.zones} · checkout ${counts?.mode} → ${counts?.whatsapp}`);
  console.log(`  Storefront : run the app with NEXT_PUBLIC_DEFAULT_RESTAURANT=${SLUG}`);
  console.log(`  Admin      : /admin  →  ${OWNER.email} / ${OWNER.password}`);
  console.log(`  WhatsApp   : set the real number in admin → Settings → WhatsApp (or SEED_WHATSAPP=… when seeding)\n`);
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}
