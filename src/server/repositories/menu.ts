import { type DbClient } from "@/server/db/database";
import { getDb } from "@/server/db/registry";
import { type RequestContext } from "@/server/context";
import { mapAddonGroup, mapMenuCategory, mapMenuItem, mapVariant, mapAddon, num, str, type Row } from "@/server/db/mappers";
import type { MenuAddonGroup, MenuCategory, MenuItem, MenuItemSummary } from "@/shared/contract/models";

/**
 * Menu data access. The "summary" projection is what storefront cards and the
 * admin table need (price-from, variant/add-on flags, rating) computed in SQL so
 * the browser never has to load the whole menu to filter it.
 */
export const SUMMARY_COLUMNS = `
  mi.*,
  mc.name as category_name,
  mc.slug as category_slug,
  coalesce((
    select min(case when v.price_mode = 'absolute' then v.price else mi.base_price + v.price end)
    from menu_item_variants v where v.menu_item_id = mi.id and v.is_available
  ), mi.base_price)::numeric(12,2) as price_from,
  exists (select 1 from menu_item_variants v where v.menu_item_id = mi.id and v.is_available) as has_variants,
  exists (select 1 from menu_addon_groups g where g.menu_item_id = mi.id and g.is_active) as has_addons,
  exists (select 1 from menu_addon_groups g where g.menu_item_id = mi.id and g.is_active and g.is_required) as requires_selection,
  (select avg(r.rating)::numeric(3,2) from reviews r where r.menu_item_id = mi.id and r.status = 'approved') as rating_average,
  (select count(*) from reviews r where r.menu_item_id = mi.id and r.status = 'approved') as rating_count
`;

export interface MenuListFilters {
  categoryId?: string;
  categorySlug?: string;
  search?: string;
  featuredOnly?: boolean;
  availableOnly?: boolean;
  includeInactive?: boolean;
  ids?: string[];
  /** storefront sections address menu items by slug */
  slugs?: string[];
  excludeIds?: string[];
  dietaryTags?: string[];
  limit?: number;
  offset?: number;
  orderBy?: "menu" | "price_asc" | "price_desc" | "name" | "popularity";
}

export function mapMenuItemSummary(row: Row): MenuItemSummary {
  return {
    id: str(row.id),
    name: str(row.name),
    slug: str(row.slug),
    description: str(row.description),
    imageUrl: row.image_url ? str(row.image_url) : null,
    basePrice: num(row.base_price).toFixed(2),
    compareAtPrice: row.compare_at_price === null || row.compare_at_price === undefined ? null : num(row.compare_at_price).toFixed(2),
    isAvailable: Boolean(row.is_available) && Boolean(row.is_active),
    isFeatured: Boolean(row.is_featured),
    hasVariants: Boolean(row.has_variants),
    hasAddons: Boolean(row.has_addons),
    requiresSelection: Boolean(row.requires_selection),
    priceFrom: num(row.price_from).toFixed(2),
    prepTimeMinutes: num(row.prep_time_minutes, 15),
    dietaryTags: Array.isArray(row.dietary_tags) ? (row.dietary_tags as string[]) : [],
    spiceLevel: num(row.spice_level),
    categoryId: str(row.category_id),
    categorySlug: row.category_slug ? str(row.category_slug) : undefined,
    categoryName: row.category_name ? str(row.category_name) : undefined,
  };
}

export async function listCategories(
  restaurantId: string,
  ctx: RequestContext = {},
  options: { includeInactive?: boolean; withCounts?: boolean } = {},
): Promise<MenuCategory[]> {
  const rows = await getDb({ restaurantId }).query<Row>(
    ctx,
    `select mc.*, ${
      options.withCounts
        ? `(select count(*) from menu_items mi where mi.category_id = mc.id and mi.is_active) as item_count`
        : "null::int as item_count"
    }
     from menu_categories mc
     where mc.restaurant_id = $1 ${options.includeInactive ? "" : "and mc.is_active"}
     order by mc.sort_order, mc.name`,
    [restaurantId],
  );
  return rows.map(mapMenuCategory);
}

export async function listMenuItems(
  restaurantId: string,
  filters: MenuListFilters = {},
  ctx: RequestContext = {},
): Promise<MenuItemSummary[]> {
  const params: unknown[] = [restaurantId];
  const conditions: string[] = ["mi.restaurant_id = $1"];

  if (!filters.includeInactive) conditions.push("mi.is_active");
  if (filters.availableOnly) conditions.push("mi.is_available");
  if (filters.featuredOnly) conditions.push("mi.is_featured");
  if (filters.categoryId) {
    params.push(filters.categoryId);
    conditions.push(`mi.category_id = $${params.length}`);
  }
  if (filters.categorySlug) {
    params.push(filters.categorySlug);
    conditions.push(`mc.slug = $${params.length}`);
  }
  if (filters.search?.trim()) {
    params.push(`%${filters.search.trim()}%`);
    conditions.push(`(mi.name ilike $${params.length} or mi.description ilike $${params.length} or mc.name ilike $${params.length})`);
  }
  if (filters.ids?.length) {
    params.push(filters.ids);
    conditions.push(`mi.id = any($${params.length}::uuid[])`);
  }
  if (filters.slugs?.length) {
    params.push(filters.slugs);
    conditions.push(`mi.slug = any($${params.length}::text[])`);
  }
  if (filters.excludeIds?.length) {
    params.push(filters.excludeIds);
    conditions.push(`not (mi.id = any($${params.length}::uuid[]))`);
  }
  if (filters.dietaryTags?.length) {
    params.push(filters.dietaryTags);
    conditions.push(`mi.dietary_tags && $${params.length}::text[]`);
  }

  const order =
    filters.orderBy === "price_asc"
      ? "mi.base_price asc, mi.sort_order"
      : filters.orderBy === "price_desc"
        ? "mi.base_price desc, mi.sort_order"
        : filters.orderBy === "name"
          ? "mi.name asc"
          : filters.orderBy === "popularity"
            ? `(select count(*) from order_items oi
                 join orders o on o.id = oi.order_id
                where oi.menu_item_id = mi.id and o.status <> 'cancelled') desc, mi.sort_order`
            : "mc.sort_order, mi.sort_order, mi.name";

  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 500);
  const offset = Math.max(filters.offset ?? 0, 0);
  params.push(limit);
  const limitParam = `$${params.length}`;
  params.push(offset);
  const offsetParam = `$${params.length}`;

  const rows = await getDb({ restaurantId }).query<Row>(
    ctx,
    `select ${SUMMARY_COLUMNS}
     from menu_items mi
     join menu_categories mc on mc.id = mi.category_id
     where ${conditions.join(" and ")}
     order by ${order}
     limit ${limitParam} offset ${offsetParam}`,
    params,
  );
  return rows.map(mapMenuItemSummary);
}

export async function countMenuItems(
  restaurantId: string,
  filters: MenuListFilters = {},
  ctx: RequestContext = {},
): Promise<number> {
  const params: unknown[] = [restaurantId];
  const conditions: string[] = ["mi.restaurant_id = $1"];
  if (!filters.includeInactive) conditions.push("mi.is_active");
  if (filters.availableOnly) conditions.push("mi.is_available");
  if (filters.featuredOnly) conditions.push("mi.is_featured");
  if (filters.search?.trim()) {
    params.push(`%${filters.search.trim()}%`);
    conditions.push(`(mi.name ilike $${params.length} or mi.description ilike $${params.length})`);
  }
  const row = await getDb({ restaurantId }).queryOne<{ count: string }>(
    ctx,
    `select count(*) from menu_items mi join menu_categories mc on mc.id = mi.category_id where ${conditions.join(" and ")}`,
    params,
  );
  return row ? Number.parseInt(row.count, 10) : 0;
}

/** Full item with variants and add-on groups (used by the item modal + checkout). */
export async function getMenuItem(
  restaurantId: string,
  identifier: { id?: string; slug?: string },
  ctx: RequestContext = {},
  options: { includeUnavailable?: boolean } = {},
): Promise<MenuItem | null> {
  const db = getDb({ restaurantId });
  return db.read(ctx, async (tx) => {
    const where: string[] = ["mi.restaurant_id = $1"];
    const params: unknown[] = [restaurantId];
    if (identifier.id) {
      params.push(identifier.id);
      where.push(`mi.id = $${params.length}`);
    } else if (identifier.slug) {
      params.push(identifier.slug);
      where.push(`mi.slug = $${params.length}`);
    } else {
      return null;
    }
    if (!options.includeUnavailable) where.push("mi.is_active");

    const row = await tx.queryOne<Row>(
      `select ${SUMMARY_COLUMNS} from menu_items mi
        join menu_categories mc on mc.id = mi.category_id
        where ${where.join(" and ")} limit 1`,
      params,
    );
    if (!row) return null;
    const item = mapMenuItem({ ...row, base_price: row.base_price, rating_average: row.rating_average });
    item.variants = await listVariants(tx, item.id, options.includeUnavailable ?? false);
    item.addonGroups = await listAddonGroups(tx, item.id, options.includeUnavailable ?? false);
    return item;
  });
}

export async function listVariants(
  tx: DbClient,
  menuItemId: string,
  includeUnavailable = false,
): Promise<MenuItem["variants"]> {
  const rows = await tx.query<Row>(
    `select * from menu_item_variants
      where menu_item_id = $1 ${includeUnavailable ? "" : "and is_available"}
      order by sort_order, price`,
    [menuItemId],
  );
  return rows.map(mapVariant);
}

export async function listAddonGroups(
  tx: DbClient,
  menuItemId: string,
  includeUnavailable = false,
): Promise<MenuAddonGroup[]> {
  const groups = await tx.query<Row>(
    `select * from menu_addon_groups
      where menu_item_id = $1 ${includeUnavailable ? "" : "and is_active"}
      order by sort_order, name`,
    [menuItemId],
  );
  const addons = groups.length
    ? await tx.query<Row>(
        `select * from menu_addons
          where addon_group_id = any($1::uuid[]) ${includeUnavailable ? "" : "and is_available"}
          order by sort_order, name`,
        [groups.map((group) => str(group.id))],
      )
    : [];

  return groups.map((group) => ({
    id: str(group.id),
    menuItemId: str(group.menu_item_id),
    name: str(group.name),
    description: group.description ? str(group.description) : null,
    isRequired: Boolean(group.is_required),
    minSelect: num(group.min_select),
    maxSelect: num(group.max_select, 1),
    sortOrder: num(group.sort_order),
    isActive: Boolean(group.is_active),
    addons: addons.filter((addon) => str(addon.addon_group_id) === str(group.id)).map(mapAddon),
  }));
}

/** One active menu item in both shapes the storefront renders, read in a single pass. */
export interface StorefrontMenuRecord {
  /** full item; variants and add-on groups include unavailable ones (the UI shows them as sold out) */
  item: MenuItem;
  summary: MenuItemSummary;
  /** order lines on non-cancelled orders, used to rank "popular" items */
  popularity: number;
}

/**
 * The whole active menu for the storefront snapshot in four set-based queries
 * (items, variants, add-on groups, add-ons) — never one query per item. Runs in
 * one RLS-enforced transaction, like every other storefront read.
 */
export async function listStorefrontMenu(restaurantId: string, ctx: RequestContext = {}): Promise<StorefrontMenuRecord[]> {
  return getDb({ restaurantId }).read(ctx, async (tx) => {
    const items = await tx.query<Row>(
      `select ${SUMMARY_COLUMNS},
         (select count(*) from order_items oi
            join orders o on o.id = oi.order_id
           where oi.menu_item_id = mi.id and o.status <> 'cancelled')::int as popularity
       from menu_items mi
       join menu_categories mc on mc.id = mi.category_id
       where mi.restaurant_id = $1 and mi.is_active
       order by mc.sort_order, mi.sort_order, mi.name`,
      [restaurantId],
    );
    const variants = await tx.query<Row>(
      `select * from menu_item_variants where restaurant_id = $1 order by sort_order, price`,
      [restaurantId],
    );
    const groups = await tx.query<Row>(
      `select * from menu_addon_groups where restaurant_id = $1 order by sort_order, name`,
      [restaurantId],
    );
    const addons = await tx.query<Row>(
      `select * from menu_addons where restaurant_id = $1 order by sort_order, name`,
      [restaurantId],
    );

    const variantsByItem = groupBy(variants, (row) => str(row.menu_item_id));
    const groupsByItem = groupBy(groups, (row) => str(row.menu_item_id));
    const addonsByGroup = groupBy(addons, (row) => str(row.addon_group_id));

    return items.map((row) => {
      const { costPrice: _costPrice, ...item } = mapMenuItem(row);
      const id = str(row.id);
      return {
        item: {
          ...item,
          variants: (variantsByItem.get(id) ?? []).map(mapVariant),
          addonGroups: (groupsByItem.get(id) ?? []).map((group) =>
            mapAddonGroup(group, (addonsByGroup.get(str(group.id)) ?? []).map(mapAddon)),
          ),
        },
        summary: mapMenuItemSummary(row),
        popularity: num(row.popularity),
      };
    });
  });
}

function groupBy(rows: Row[], key: (row: Row) => string): Map<string, Row[]> {
  const grouped = new Map<string, Row[]>();
  for (const row of rows) {
    const bucket = grouped.get(key(row));
    if (bucket) bucket.push(row);
    else grouped.set(key(row), [row]);
  }
  return grouped;
}

export interface CreateMenuItemInput {
  categoryId: string;
  name: string;
  slug: string;
  description?: string | null;
  shortDescription?: string | null;
  imageUrl?: string | null;
  basePrice: string;
  compareAtPrice?: string | null;
  prepTimeMinutes?: number;
  spiceLevel?: number;
  isActive?: boolean;
  isAvailable?: boolean;
  isFeatured?: boolean;
  dietaryTags?: string[];
  allergens?: string[];
  sortOrder?: number;
  availability?: unknown;
  calories?: number | null;
}

export async function createMenuItem(
  restaurantId: string,
  input: CreateMenuItemInput,
  ctx: RequestContext,
): Promise<MenuItem> {
  const db = getDb({ restaurantId });
  return db.write(ctx, async (tx) => {
    const row = await tx.queryOne<Row>(
      `insert into menu_items
         (restaurant_id, category_id, name, slug, description, short_description, image_url, base_price,
          compare_at_price, prep_time_minutes, spice_level, is_active, is_available, is_featured,
          dietary_tags, allergens, sort_order, availability, calories)
       values ($1,$2,$3,$4,$5,$6,$7,$8::numeric,$9::numeric,coalesce($10,15),coalesce($11,0),
               coalesce($12,true),coalesce($13,true),coalesce($14,false),coalesce($15,'{}'),coalesce($16,'{}'),
               coalesce($17, (select coalesce(max(sort_order),0)+1 from menu_items where category_id = $2)),
               coalesce($18::jsonb,'{}'::jsonb), $19)
       returning *`,
      [
        restaurantId, input.categoryId, input.name, input.slug, input.description ?? null,
        input.shortDescription ?? null, input.imageUrl ?? null, input.basePrice,
        input.compareAtPrice ?? null, input.prepTimeMinutes ?? null, input.spiceLevel ?? null,
        input.isActive ?? null, input.isAvailable ?? null, input.isFeatured ?? null,
        input.dietaryTags ?? null, input.allergens ?? null, input.sortOrder ?? null,
        input.availability === undefined ? null : JSON.stringify(input.availability), input.calories ?? null,
      ],
    );
    if (!row) throw new Error("Menu item insert failed");
    return mapMenuItem(row);
  });
}

export async function updateMenuItem(
  itemId: string,
  patch: Partial<CreateMenuItemInput> & { categoryId?: string },
  ctx: RequestContext,
): Promise<MenuItem> {
  const db = getDb(ctx);
  return db.write(ctx, async (tx) => {
    const row = await tx.queryOne<Row>(
      `update menu_items set
         category_id = coalesce($2, category_id),
         name = coalesce($3, name),
         slug = coalesce($4, slug),
         description = coalesce($5, description),
         short_description = coalesce($6, short_description),
         image_url = coalesce($7, image_url),
         base_price = coalesce($8::numeric, base_price),
         compare_at_price = coalesce($9::numeric, compare_at_price),
         prep_time_minutes = coalesce($10, prep_time_minutes),
         spice_level = coalesce($11, spice_level),
         is_active = coalesce($12, is_active),
         is_available = coalesce($13, is_available),
         is_featured = coalesce($14, is_featured),
         dietary_tags = coalesce($15, dietary_tags),
         allergens = coalesce($16, allergens),
         sort_order = coalesce($17, sort_order),
         availability = coalesce($18::jsonb, availability),
         calories = coalesce($19, calories)
       where id = $1
       returning *`,
      [
        itemId, patch.categoryId ?? null, patch.name ?? null, patch.slug ?? null, patch.description ?? null,
        patch.shortDescription ?? null, patch.imageUrl ?? null, patch.basePrice ?? null,
        patch.compareAtPrice ?? null, patch.prepTimeMinutes ?? null, patch.spiceLevel ?? null,
        patch.isActive ?? null, patch.isAvailable ?? null, patch.isFeatured ?? null,
        patch.dietaryTags ?? null, patch.allergens ?? null, patch.sortOrder ?? null,
        patch.availability === undefined ? null : JSON.stringify(patch.availability), patch.calories ?? null,
      ],
    );
    if (!row) throw new Error("Menu item not found");
    return mapMenuItem(row);
  });
}

export async function deleteMenuItem(itemId: string, ctx: RequestContext): Promise<void> {
  await getDb(ctx).write(ctx, async (tx) => {
    await tx.query(`delete from menu_items where id = $1`, [itemId]);
  });
}

export async function setMenuItemAvailability(
  itemId: string,
  patch: { isAvailable?: boolean; isActive?: boolean; isFeatured?: boolean },
  ctx: RequestContext,
): Promise<MenuItem> {
  const db = getDb(ctx);
  return db.write(ctx, async (tx) => {
    const row = await tx.queryOne<Row>(
      `update menu_items set
         is_available = coalesce($2, is_available),
         is_active = coalesce($3, is_active),
         is_featured = coalesce($4, is_featured)
       where id = $1 returning *`,
      [itemId, patch.isAvailable ?? null, patch.isActive ?? null, patch.isFeatured ?? null],
    );
    if (!row) throw new Error("Menu item not found");
    return mapMenuItem(row);
  });
}

export async function reorderMenuItems(itemIds: string[], ctx: RequestContext): Promise<void> {
  const db = getDb(ctx);
  await db.write(ctx, async (tx) => {
    for (const [index, itemId] of itemIds.entries()) {
      await tx.query(`update menu_items set sort_order = $2 where id = $1`, [itemId, index]);
    }
  });
}

export interface CategoryInput {
  name: string;
  slug: string;
  description?: string | null;
  imageUrl?: string | null;
  icon?: string | null;
  isActive?: boolean;
  isFeatured?: boolean;
  sortOrder?: number;
  availability?: unknown;
}

export async function createCategory(
  restaurantId: string,
  input: CategoryInput,
  ctx: RequestContext,
): Promise<MenuCategory> {
  const db = getDb({ restaurantId });
  return db.write(ctx, async (tx) => {
    const row = await tx.queryOne<Row>(
      `insert into menu_categories
         (restaurant_id, name, slug, description, image_url, icon, is_active, is_featured, sort_order, availability)
       values ($1,$2,$3,$4,$5,$6,coalesce($7,true),coalesce($8,false),
               coalesce($9, (select coalesce(max(sort_order),0)+1 from menu_categories where restaurant_id = $1)),
               coalesce($10::jsonb,'{}'::jsonb))
       returning *`,
      [
        restaurantId, input.name, input.slug, input.description ?? null, input.imageUrl ?? null,
        input.icon ?? null, input.isActive ?? null, input.isFeatured ?? null, input.sortOrder ?? null,
        input.availability === undefined ? null : JSON.stringify(input.availability),
      ],
    );
    if (!row) throw new Error("Category insert failed");
    return mapMenuCategory(row);
  });
}

export async function updateCategory(
  categoryId: string,
  patch: Partial<CategoryInput>,
  ctx: RequestContext,
): Promise<MenuCategory> {
  const db = getDb(ctx);
  return db.write(ctx, async (tx) => {
    const row = await tx.queryOne<Row>(
      `update menu_categories set
         name = coalesce($2, name),
         slug = coalesce($3, slug),
         description = coalesce($4, description),
         image_url = coalesce($5, image_url),
         icon = coalesce($6, icon),
         is_active = coalesce($7, is_active),
         is_featured = coalesce($8, is_featured),
         sort_order = coalesce($9, sort_order),
         availability = coalesce($10::jsonb, availability)
       where id = $1 returning *`,
      [
        categoryId, patch.name ?? null, patch.slug ?? null, patch.description ?? null, patch.imageUrl ?? null,
        patch.icon ?? null, patch.isActive ?? null, patch.isFeatured ?? null, patch.sortOrder ?? null,
        patch.availability === undefined ? null : JSON.stringify(patch.availability),
      ],
    );
    if (!row) throw new Error("Category not found");
    return mapMenuCategory(row);
  });
}

export async function deleteCategory(categoryId: string, ctx: RequestContext): Promise<void> {
  await getDb(ctx).write(ctx, async (tx) => {
    await tx.query(`delete from menu_categories where id = $1`, [categoryId]);
  });
}

export async function reorderCategories(categoryIds: string[], ctx: RequestContext): Promise<void> {
  const db = getDb(ctx);
  await db.write(ctx, async (tx) => {
    for (const [index, categoryId] of categoryIds.entries()) {
      await tx.query(`update menu_categories set sort_order = $2 where id = $1`, [categoryId, index]);
    }
  });
}

export interface VariantInput {
  name: string;
  price: string;
  priceMode?: "absolute" | "delta";
  isDefault?: boolean;
  isAvailable?: boolean;
  sortOrder?: number;
}

export async function createVariant(
  restaurantId: string,
  menuItemId: string,
  input: VariantInput,
  ctx: RequestContext,
): Promise<MenuItem["variants"][number]> {
  const db = getDb({ restaurantId });
  return db.write(ctx, async (tx) => {
    if (input.isDefault) {
      await tx.query(`update menu_item_variants set is_default = false where menu_item_id = $1`, [menuItemId]);
    }
    const row = await tx.queryOne<Row>(
      `insert into menu_item_variants
         (restaurant_id, menu_item_id, name, price, price_mode, is_default, is_available, sort_order)
       values ($1,$2,$3,$4::numeric,coalesce($5,'absolute'),coalesce($6,false),coalesce($7,true),
               coalesce($8,(select coalesce(max(sort_order),0)+1 from menu_item_variants where menu_item_id = $2)))
       returning *`,
      [restaurantId, menuItemId, input.name, input.price, input.priceMode ?? null, input.isDefault ?? null,
       input.isAvailable ?? null, input.sortOrder ?? null],
    );
    if (!row) throw new Error("Variant insert failed");
    return mapVariant(row);
  });
}

export async function updateVariant(
  variantId: string,
  patch: Partial<VariantInput>,
  ctx: RequestContext,
): Promise<void> {
  const db = getDb(ctx);
  await db.write(ctx, async (tx) => {
    const variant = await tx.queryOne<Row>(`select menu_item_id from menu_item_variants where id = $1`, [variantId]);
    if (!variant) throw new Error("Variant not found");
    if (patch.isDefault) {
      await tx.query(`update menu_item_variants set is_default = false where menu_item_id = $1`, [variant.menu_item_id]);
    }
    await tx.query(
      `update menu_item_variants set
         name = coalesce($2, name),
         price = coalesce($3::numeric, price),
         price_mode = coalesce($4, price_mode),
         is_default = coalesce($5, is_default),
         is_available = coalesce($6, is_available),
         sort_order = coalesce($7, sort_order)
       where id = $1`,
      [variantId, patch.name ?? null, patch.price ?? null, patch.priceMode ?? null, patch.isDefault ?? null,
       patch.isAvailable ?? null, patch.sortOrder ?? null],
    );
  });
}

export async function deleteVariant(variantId: string, ctx: RequestContext): Promise<void> {
  await getDb(ctx).write(ctx, async (tx) => {
    await tx.query(`delete from menu_item_variants where id = $1`, [variantId]);
  });
}

export interface AddonGroupInput {
  name: string;
  description?: string | null;
  isRequired?: boolean;
  minSelect?: number;
  maxSelect?: number;
  isActive?: boolean;
  sortOrder?: number;
}

export async function createAddonGroup(
  restaurantId: string,
  menuItemId: string,
  input: AddonGroupInput,
  ctx: RequestContext,
): Promise<MenuAddonGroup> {
  const db = getDb({ restaurantId });
  return db.write(ctx, async (tx) => {
    const row = await tx.queryOne<Row>(
      `insert into menu_addon_groups
         (restaurant_id, menu_item_id, name, description, is_required, min_select, max_select, is_active, sort_order)
       values ($1,$2,$3,$4,coalesce($5,false),coalesce($6,0),coalesce($7,1),coalesce($8,true),
               coalesce($9,(select coalesce(max(sort_order),0)+1 from menu_addon_groups where menu_item_id = $2)))
       returning *`,
      [restaurantId, menuItemId, input.name, input.description ?? null, input.isRequired ?? null,
       input.minSelect ?? null, input.maxSelect ?? null, input.isActive ?? null, input.sortOrder ?? null],
    );
    if (!row) throw new Error("Add-on group insert failed");
    return mapAddonGroup(row, []);
  });
}

export async function updateAddonGroup(
  groupId: string,
  patch: Partial<AddonGroupInput>,
  ctx: RequestContext,
): Promise<void> {
  await getDb(ctx).write(ctx, async (tx) => {
    await tx.query(
      `update menu_addon_groups set
         name = coalesce($2, name),
         description = coalesce($3, description),
         is_required = coalesce($4, is_required),
         max_select = coalesce($6, max_select),
         is_active = coalesce($7, is_active),
         sort_order = coalesce($8, sort_order),
         -- a group that stops being required must not keep min_select > 0
         min_select = case when $4 = false then 0 else coalesce($5, min_select) end
       where id = $1`,
      [groupId, patch.name ?? null, patch.description ?? null, patch.isRequired ?? null, patch.minSelect ?? null,
       patch.maxSelect ?? null, patch.isActive ?? null, patch.sortOrder ?? null],
    );
  });
}

export async function deleteAddonGroup(groupId: string, ctx: RequestContext): Promise<void> {
  await getDb(ctx).write(ctx, async (tx) => {
    await tx.query(`delete from menu_addon_groups where id = $1`, [groupId]);
  });
}

export interface AddonInput {
  name: string;
  description?: string | null;
  price: string;
  isDefault?: boolean;
  isAvailable?: boolean;
  maxQuantity?: number;
  sortOrder?: number;
}

export async function createAddon(
  restaurantId: string,
  addonGroupId: string,
  input: AddonInput,
  ctx: RequestContext,
): Promise<MenuItem["addonGroups"][number]["addons"][number]> {
  const db = getDb({ restaurantId });
  return db.write(ctx, async (tx) => {
    const row = await tx.queryOne<Row>(
      `insert into menu_addons
         (restaurant_id, addon_group_id, name, description, price, is_default, is_available, max_quantity, sort_order)
       values ($1,$2,$3,$4,$5::numeric,coalesce($6,false),coalesce($7,true),coalesce($8,1),
               coalesce($9,(select coalesce(max(sort_order),0)+1 from menu_addons where addon_group_id = $2)))
       returning *`,
      [restaurantId, addonGroupId, input.name, input.description ?? null, input.price, input.isDefault ?? null,
       input.isAvailable ?? null, input.maxQuantity ?? null, input.sortOrder ?? null],
    );
    if (!row) throw new Error("Add-on insert failed");
    return mapAddon(row);
  });
}

export async function updateAddon(addonId: string, patch: Partial<AddonInput>, ctx: RequestContext): Promise<void> {
  await getDb(ctx).write(ctx, async (tx) => {
    await tx.query(
      `update menu_addons set
         name = coalesce($2, name),
         description = coalesce($3, description),
         price = coalesce($4::numeric, price),
         is_default = coalesce($5, is_default),
         is_available = coalesce($6, is_available),
         max_quantity = coalesce($7, max_quantity),
         sort_order = coalesce($8, sort_order)
       where id = $1`,
      [addonId, patch.name ?? null, patch.description ?? null, patch.price ?? null, patch.isDefault ?? null,
       patch.isAvailable ?? null, patch.maxQuantity ?? null, patch.sortOrder ?? null],
    );
  });
}

export async function deleteAddon(addonId: string, ctx: RequestContext): Promise<void> {
  await getDb(ctx).write(ctx, async (tx) => {
    await tx.query(`delete from menu_addons where id = $1`, [addonId]);
  });
}
