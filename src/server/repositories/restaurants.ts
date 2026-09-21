import { type DbClient } from '@/server/db/database';
import { getDb } from "@/server/db/registry";
import { type RequestContext } from "@/server/context";
import { mapLocation, mapRestaurant, type Row } from '@/server/db/mappers';
import type { Restaurant, RestaurantLocation } from '@/shared/contract/models';

const RESTAURANT_COLUMNS = `
  id, name, slug, legal_name, description, short_description, cuisines, phone, whatsapp, email,
  website_url, logo_url, cover_url, primary_color, currency, currency_symbol, locale, timezone,
  country, status, plan, plan_status, features, settings, social, seo, created_at, updated_at
`;

export async function getRestaurantBySlug(
  slug: string,
  ctx: RequestContext = {},
): Promise<Restaurant | null> {
  // Slug resolution happens before the restaurant is known, so this is a
  // platform-level lookup: the registry decides where the directory lives.
  const row = await getDb().queryOne<Row>(
    ctx,
    `select ${RESTAURANT_COLUMNS} from restaurants where slug = $1`,
    [slug],
  );
  return row ? mapRestaurant(row) : null;
}

export async function getRestaurantById(
  id: string,
  ctx: RequestContext = {},
): Promise<Restaurant | null> {
  const row = await getDb({ restaurantId: id }).queryOne<Row>(
    ctx,
    `select ${RESTAURANT_COLUMNS} from restaurants where id = $1`,
    [id],
  );
  return row ? mapRestaurant(row) : null;
}

export async function listPublicRestaurants(
  ctx: RequestContext = {},
): Promise<Restaurant[]> {
  const rows = await getDb().query<Row>(
    ctx,
    `select ${RESTAURANT_COLUMNS} from restaurants where status = 'active' order by name`,
  );
  return rows.map(mapRestaurant);
}

export async function listLocations(
  restaurantId: string,
  ctx: RequestContext = {},
  options: { activeOnly?: boolean } = {},
): Promise<RestaurantLocation[]> {
  const rows = await getDb({ restaurantId }).query<Row>(
    ctx,
    `select * from restaurant1s
      where restaurant_id = $1 ${options.activeOnly ? 'and is_active' : ''}
      order by is_primary desc, sort_order, name`,
    [restaurantId],
  );
  return rows.map(mapLocation);
}

export async function getPrimaryLocation(
  restaurantId: string,
  ctx: RequestContext = {},
): Promise<RestaurantLocation | null> {
  const row = await getDb({ restaurantId }).queryOne<Row>(
    ctx,
    `select * from restaurant1s
      where restaurant_id = $1 and is_active
      order by is_primary desc, sort_order, name limit 1`,
    [restaurantId],
  );
  return row ? mapLocation(row) : null;
}

export async function getLocationById(
  locationId: string,
  ctx: RequestContext = {},
): Promise<RestaurantLocation | null> {
  const row = await getDb(ctx).queryOne<Row>(
    ctx,
    `select * from restaurant1s where id = $1`,
    [locationId],
  );
  return row ? mapLocation(row) : null;
}

export async function updateRestaurant(
  restaurantId: string,
  patch: Partial<{
    name: string;
    description: string | null;
    shortDescription: string | null;
    cuisines: string[];
    phone: string | null;
    whatsapp: string | null;
    email: string | null;
    logoUrl: string | null;
    coverUrl: string | null;
    primaryColor: string | null;
    currency: string;
    currencySymbol: string;
    timezone: string;
    locale: string;
    country: string;
    status: Restaurant['status'];
    features: unknown;
    settings: unknown;
    social: unknown;
  }>,
  ctx: RequestContext,
): Promise<Restaurant> {
  const db = getDb({ restaurantId });
  return db.write(ctx, async (tx) => {
    const row = await tx.queryOne<Row>(
      `update restaurants set
         name = coalesce($2, name),
         description = coalesce($3, description),
         short_description = coalesce($4, short_description),
         cuisines = coalesce($5, cuisines),
         phone = coalesce($6, phone),
         whatsapp = coalesce($7, whatsapp),
         email = coalesce($8, email),
         logo_url = coalesce($9, logo_url),
         cover_url = coalesce($10, cover_url),
         primary_color = coalesce($11, primary_color),
         currency = coalesce($12, currency),
         currency_symbol = coalesce($13, currency_symbol),
         timezone = coalesce($14, timezone),
         locale = coalesce($15, locale),
         country = coalesce($16, country),
         status = coalesce($17, status),
         features = coalesce($18::jsonb, features),
         settings = coalesce($19::jsonb, settings),
         social = coalesce($20::jsonb, social)
       where id = $1
       returning ${RESTAURANT_COLUMNS}`,
      [
        restaurantId,
        patch.name ?? null,
        patch.description ?? null,
        patch.shortDescription ?? null,
        patch.cuisines ?? null,
        patch.phone ?? null,
        patch.whatsapp ?? null,
        patch.email ?? null,
        patch.logoUrl ?? null,
        patch.coverUrl ?? null,
        patch.primaryColor ?? null,
        patch.currency ?? null,
        patch.currencySymbol ?? null,
        patch.timezone ?? null,
        patch.locale ?? null,
        patch.country ?? null,
        patch.status ?? null,
        patch.features === undefined ? null : JSON.stringify(patch.features),
        patch.settings === undefined ? null : JSON.stringify(patch.settings),
        patch.social === undefined ? null : JSON.stringify(patch.social),
      ],
    );
    if (!row) throw new Error('Restaurant not found');
    return mapRestaurant(row);
  });
}

export interface LocationInput {
  name: string;
  slug?: string;
  isPrimary?: boolean;
  isActive?: boolean;
  addressLine1?: string | null;
  addressLine2?: string | null;
  area?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string;
  phone?: string | null;
  email?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  hours?: unknown;
  sortOrder?: number;
}

export async function createLocation(
  restaurantId: string,
  input: LocationInput,
  ctx: RequestContext,
): Promise<RestaurantLocation> {
  const db = getDb({ restaurantId });
  return db.write(ctx, async (tx) => {
    if (input.isPrimary) {
      await tx.query(
        `update restaurant1s set is_primary = false where restaurant_id = $1`,
        [restaurantId],
      );
    }
    const row = await tx.queryOne<Row>(
      `insert into restaurant1s
         (restaurant_id, name, slug, is_primary, is_active, address_line1, address_line2, area, city, state,
          postal_code, country, phone, email, latitude, longitude, hours, sort_order)
       values ($1, $2, coalesce($3, app.slugify($2)), coalesce($4, not exists (
                 select 1 from restaurant1s where restaurant_id = $1)), coalesce($5, true),
               $6, $7, $8, $9, $10, $11, coalesce($12, 'PK'), $13, $14, $15, $16, coalesce($17::jsonb, '{}'::jsonb),
               coalesce($18, 0))
       returning *`,
      [
        restaurantId,
        input.name,
        input.slug ?? null,
        input.isPrimary ?? null,
        input.isActive ?? null,
        input.addressLine1 ?? null,
        input.addressLine2 ?? null,
        input.area ?? null,
        input.city ?? null,
        input.state ?? null,
        input.postalCode ?? null,
        input.country ?? null,
        input.phone ?? null,
        input.email ?? null,
        input.latitude ?? null,
        input.longitude ?? null,
        input.hours === undefined ? null : JSON.stringify(input.hours),
        input.sortOrder ?? null,
      ],
    );
    if (!row) throw new Error('Location insert failed');
    return mapLocation(row);
  });
}

export async function updateLocation(
  locationId: string,
  patch: LocationInput & { id?: undefined },
  ctx: RequestContext,
): Promise<RestaurantLocation> {
  const db = getDb(ctx);
  return db.write(ctx, async (tx) => {
    const current = await tx.queryOne<Row>(
      `select restaurant_id from restaurant1s where id = $1`,
      [locationId],
    );
    if (!current) throw new Error('Location not found');
    if (patch.isPrimary) {
      await tx.query(
        `update restaurant1s set is_primary = false where restaurant_id = $1 and id <> $2`,
        [current.restaurant_id, locationId],
      );
    }
    const row = await tx.queryOne<Row>(
      `update restaurant1s set
         name = coalesce($2, name),
         is_primary = coalesce($3, is_primary),
         is_active = coalesce($4, is_active),
         address_line1 = coalesce($5, address_line1),
         address_line2 = coalesce($6, address_line2),
         area = coalesce($7, area),
         city = coalesce($8, city),
         state = coalesce($9, state),
         postal_code = coalesce($10, postal_code),
         country = coalesce($11, country),
         phone = coalesce($12, phone),
         email = coalesce($13, email),
         latitude = coalesce($14, latitude),
         longitude = coalesce($15, longitude),
         hours = coalesce($16::jsonb, hours),
         sort_order = coalesce($17, sort_order)
       where id = $1
       returning *`,
      [
        locationId,
        patch.name ?? null,
        patch.isPrimary ?? null,
        patch.isActive ?? null,
        patch.addressLine1 ?? null,
        patch.addressLine2 ?? null,
        patch.area ?? null,
        patch.city ?? null,
        patch.state ?? null,
        patch.postalCode ?? null,
        patch.country ?? null,
        patch.phone ?? null,
        patch.email ?? null,
        patch.latitude ?? null,
        patch.longitude ?? null,
        patch.hours === undefined ? null : JSON.stringify(patch.hours),
        patch.sortOrder ?? null,
      ],
    );
    if (!row) throw new Error('Location not found');
    return mapLocation(row);
  });
}

export async function deleteLocation(
  locationId: string,
  ctx: RequestContext,
): Promise<void> {
  const db = getDb(ctx);
  await db.write(ctx, async (tx: DbClient) => {
    await tx.query(`delete from restaurant1s where id = $1`, [
      locationId,
    ]);
  });
}
