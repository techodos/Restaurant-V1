import { dec, round2, sumMoney, toMoney } from "@/shared/money";
import { PricingError } from "@/server/domain/pricing";
import { errors } from "@/server/errors";
import { isWindowActive } from "@/shared/hours";
import type { OrderType } from "@/shared/contract/enums";
import type { Cart, CartItem, MenuItem } from "@/shared/contract/models";
import { mapCart, mapCartAddon, mapCartItem, num, str, type Row } from "@/server/db/mappers";
import { type DbClient } from "@/server/db/database";
import { getDb } from "@/server/db/registry";
import { type RequestContext } from "@/server/context";

/**
 * Cart service.
 *
 * Carts are written through the runtime role with RLS enforced: a guest's cart
 * is reachable only with the opaque token that matches carts.session_token, and
 * an authenticated customer's cart only with their customer id in the request
 * context. Every write revalidates the menu from the database — prices and
 * availability coming from the browser are ignored.
 */

export interface CartItemAddonInput {
  addonId: string;
  quantity?: number;
}

export interface AddItemInput {
  menuItemId: string;
  variantId?: string | null;
  quantity?: number;
  addons?: CartItemAddonInput[];
  specialInstructions?: string | null;
}

const CART_SELECT = "id, restaurant_id, customer_id, location_id, session_token, status, order_type, coupon_id, coupon_code, currency, notes";

export async function getCartByToken(
  restaurantId: string,
  cartToken: string,
  ctx: RequestContext,
): Promise<Cart | null> {
  const db = getDb({ restaurantId });
  return db.asRuntime({ ...ctx, cartToken }, async (tx) => {
    const row = await tx.queryOne<Row>(
      `select ${CART_SELECT} from carts
        where restaurant_id = $1 and session_token = $2 and status = 'active'
        order by updated_at desc limit 1`,
      [restaurantId, cartToken],
    );
    if (!row) return null;
    return hydrateCart(tx, row);
  });
}

export async function getOrCreateCart(
  params: { restaurantId: string; locationId?: string | null; customerId?: string | null; cartToken: string; currency: string },
  ctx: RequestContext,
): Promise<Cart> {
  const existing = await getCartByToken(params.restaurantId, params.cartToken, ctx);
  if (existing) {
    if (params.customerId && !existing.customerId) {
      const db = getDb({ restaurantId: params.restaurantId });
      await db.asRuntime({ ...ctx, cartToken: params.cartToken, customerId: params.customerId }, async (tx) => {
        await tx.query(`update carts set customer_id = $2 where id = $1`, [existing.id, params.customerId]);
      });
      existing.customerId = params.customerId;
    }
    return existing;
  }

  const db = getDb({ restaurantId: params.restaurantId });
  const created = await db.asRuntime({ ...ctx, cartToken: params.cartToken, customerId: params.customerId ?? null }, async (tx) => {
    // "Look for the active cart, else create it" is not atomic: two requests that overlap (a quick
    // double tap, two dishes added in a row, two tabs) both find nothing and both insert. The
    // one-active-cart-per-(restaurant, token) index (0010 / 0023) then rejected the second with a raw unique violation
    // ("That record already exists"). The insert is therefore idempotent: the loser inserts nothing
    // and takes the winner's cart below.
    const row = await tx.queryOne<Row>(
      `insert into carts (restaurant_id, customer_id, location_id, session_token, currency)
       values ($1, $2, $3, $4, $5)
       on conflict do nothing
       returning ${CART_SELECT}`,
      [params.restaurantId, params.customerId ?? null, params.locationId ?? null, params.cartToken, params.currency],
    );
    return row ? mapCart(row, []) : null;
  });
  if (created) return created;

  const winner = await getCartByToken(params.restaurantId, params.cartToken, ctx);
  if (!winner) {
    // The token is held by an active cart this visitor cannot read: one owned by another account (RLS),
    // or one at another restaurant (the active-token index is global). openCart starts a fresh cart.
    throw errors.custom("CART_TOKEN_TAKEN", "That cart belongs to someone else.");
  }
  if (params.customerId && !winner.customerId) {
    await db.asRuntime({ ...ctx, cartToken: params.cartToken, customerId: params.customerId }, async (tx) => {
      await tx.query(`update carts set customer_id = $2 where id = $1`, [winner.id, params.customerId]);
    });
    winner.customerId = params.customerId;
  }
  return winner;
}

/** Loads items + add-ons and refreshes prices from the live menu. */
export async function hydrateCart(tx: DbClient, cartRow: Row): Promise<Cart> {
  const cartId = str(cartRow.id);
  const itemRows = await tx.query<Row>(
    `select ci.*, mi.image_url, mi.slug, (mi.is_active and mi.is_available and mi.availability is not null) as menu_available,
            coalesce(mi.is_active and mi.is_available, false) as is_available
       from cart_items ci
       left join menu_items mi on mi.id = ci.menu_item_id
      where ci.cart_id = $1
      order by ci.created_at`,
    [cartId],
  );

  const addonRows = itemRows.length
    ? await tx.query<Row>(
        `select * from cart_item_addons where cart_item_id = any($1::uuid[]) order by created_at`,
        [itemRows.map((row) => str(row.id))],
      )
    : [];

  const items: CartItem[] = itemRows.map((row) =>
    mapCartItem(
      row,
      addonRows.filter((addon) => str(addon.cart_item_id) === str(row.id)).map(mapCartAddon),
    ),
  );

  return mapCart(cartRow, items);
}

export async function getCartById(cartId: string, ctx: RequestContext): Promise<Cart | null> {
  const db = getDb(ctx);
  return db.asRuntime(ctx, async (tx) => {
    const row = await tx.queryOne<Row>(`select ${CART_SELECT} from carts where id = $1 and status = 'active'`, [cartId]);
    if (!row) return null;
    return hydrateCart(tx, row);
  });
}

/** Validates an item + its options against the database and returns canonical pricing. */
export interface ResolvedItemSelection {
  item: MenuItem;
  variant: { id: string; name: string; price: string } | null;
  unitPrice: string;
  addonsTotal: string;
  addons: { addonId: string; groupId: string; groupName: string; name: string; price: string; quantity: number }[];
}

export async function resolveItemSelection(
  tx: DbClient,
  restaurantId: string,
  timezone: string,
  input: AddItemInput,
  now = new Date(),
): Promise<ResolvedItemSelection> {
  const itemRow = await tx.queryOne<Row>(
    `select mi.*, mc.name as category_name, mc.slug as category_slug,
            mc.is_active as category_active, mc.availability as category_availability
       from menu_items mi join menu_categories mc on mc.id = mi.category_id
      where mi.id = $1 and mi.restaurant_id = $2`,
    [input.menuItemId, restaurantId],
  );
  if (!itemRow) throw new PricingError("ITEM_UNAVAILABLE", "That item is no longer on the menu.");
  if (!Boolean(itemRow.is_active) || !Boolean(itemRow.is_available) || !Boolean(itemRow.category_active)) {
    throw new PricingError("ITEM_UNAVAILABLE", "That item is currently unavailable.", { itemId: str(itemRow.id) });
  }
  if (
    !isWindowActive((itemRow.availability ?? {}) as never, now, timezone) ||
    !isWindowActive((itemRow.category_availability ?? {}) as never, now, timezone)
  ) {
    throw new PricingError("ITEM_UNAVAILABLE", "That item is not being served right now.", { itemId: str(itemRow.id) });
  }

  const variantRows = await tx.query<Row>(
    `select * from menu_item_variants where menu_item_id = $1 and is_available order by sort_order, price`,
    [input.menuItemId],
  );
  let variant: ResolvedItemSelection["variant"] = null;
  let unitPrice = dec(str(itemRow.base_price));

  if (variantRows.length > 0) {
    const requested = input.variantId
      ? variantRows.find((row) => str(row.id) === input.variantId)
      : variantRows.find((row) => Boolean(row.is_default)) ?? null;

    if (input.variantId && !requested) {
      throw new PricingError("VARIANT_INVALID", "The selected option is not available.", { itemId: str(itemRow.id) });
    }
    if (!requested && variantRows.some((row) => Boolean(row.is_default))) {
      throw new PricingError("VARIANT_REQUIRED", "Please choose an option for this item.", { itemId: str(itemRow.id) });
    }
    if (requested) {
      const variantPrice = dec(str(requested.price));
      unitPrice = str(requested.price_mode) === "delta" ? dec(str(itemRow.base_price)).plus(variantPrice) : variantPrice;
      variant = { id: str(requested.id), name: str(requested.name), price: toMoney(variantPrice) };
    } else if (variantRows.length > 0 && !input.variantId) {
      throw new PricingError("VARIANT_REQUIRED", "Please choose an option for this item.", { itemId: str(itemRow.id) });
    }
  }

  const groupRows = await tx.query<Row>(
    `select * from menu_addon_groups where menu_item_id = $1 and is_active order by sort_order, name`,
    [input.menuItemId],
  );
  const addonRows = groupRows.length
    ? await tx.query<Row>(
        `select * from menu_addons where addon_group_id = any($1::uuid[]) and is_available`,
        [groupRows.map((group) => str(group.id))],
      )
    : [];

  const requestedAddons = input.addons ?? [];
  const resolvedAddons: ResolvedItemSelection["addons"] = [];
  const addonIds = new Set<string>();

  for (const selection of requestedAddons) {
    if (addonIds.has(selection.addonId)) continue; // duplicate guard; quantity handles repeats
    const addon = addonRows.find((row) => str(row.id) === selection.addonId);
    if (!addon) {
      throw new PricingError("ADDON_INVALID", "One of the selected extras is not available.", {
        addonId: selection.addonId,
      });
    }
    const group = groupRows.find((row) => str(row.id) === str(addon.addon_group_id));
    if (!group) continue;
    const maxQuantity = Math.max(1, num(addon.max_quantity, 1));
    const quantity = Math.min(Math.max(1, Math.trunc(selection.quantity ?? 1)), maxQuantity);
    addonIds.add(selection.addonId);
    resolvedAddons.push({
      addonId: str(addon.id),
      groupId: str(group.id),
      groupName: str(group.name),
      name: str(addon.name),
      price: toMoney(str(addon.price)),
      quantity,
    });
  }

  // Defaults first: when a group is not satisfied by the explicit selection we
  // apply the add-ons flagged as defaults before enforcing min_select, so a
  // customer can add a pizza without re-picking the house crust.
  for (const group of groupRows) {
    const groupId = str(group.id);
    const minSelect = num(group.min_select);
    if (minSelect <= 0) continue;
    const alreadySelected = resolvedAddons.filter((addon) => addon.groupId === groupId).length;
    if (alreadySelected >= minSelect) continue;
    const defaults = addonRows
      .filter((row) => str(row.addon_group_id) === groupId && Boolean(row.is_default))
      .slice(0, minSelect - alreadySelected);
    for (const row of defaults) {
      const addonId = str(row.id);
      if (addonIds.has(addonId)) continue;
      addonIds.add(addonId);
      resolvedAddons.push({
        addonId,
        groupId,
        groupName: str(group.name),
        name: str(row.name),
        price: toMoney(str(row.price)),
        quantity: 1,
      });
    }
  }

  // required / min / max rules per group
  for (const group of groupRows) {
    const groupId = str(group.id);
    const selected = resolvedAddons.filter((addon) => addon.groupId === groupId);
    const minSelect = num(group.min_select);
    const maxSelect = Math.max(1, num(group.max_select, 1));
    if (selected.length < minSelect) {
      throw new PricingError("ADDON_REQUIRED", `Choose at least ${minSelect} option(s) for ${str(group.name)}.`, {
        groupId,
        groupName: str(group.name),
        minSelect,
      });
    }
    if (selected.length > maxSelect) {
      throw new PricingError("ADDON_LIMIT", `Choose at most ${maxSelect} option(s) for ${str(group.name)}.`, {
        groupId,
        groupName: str(group.name),
        maxSelect,
      });
    }
  }

  const addonsTotal = sumMoney(resolvedAddons.map((addon) => dec(addon.price).times(addon.quantity)));


  return {
    item: {
      id: str(itemRow.id),
      restaurantId: str(itemRow.restaurant_id),
      categoryId: str(itemRow.category_id),
      name: str(itemRow.name),
      slug: str(itemRow.slug),
      description: itemRow.description ? str(itemRow.description) : null,
      shortDescription: itemRow.short_description ? str(itemRow.short_description) : null,
      imageUrl: itemRow.image_url ? str(itemRow.image_url) : null,
      basePrice: toMoney(str(itemRow.base_price)),
      compareAtPrice: itemRow.compare_at_price ? toMoney(str(itemRow.compare_at_price)) : null,
      calories: itemRow.calories ? num(itemRow.calories) : null,
      spiceLevel: num(itemRow.spice_level),
      prepTimeMinutes: num(itemRow.prep_time_minutes, 15),
      isActive: Boolean(itemRow.is_active),
      isAvailable: Boolean(itemRow.is_available),
      isFeatured: Boolean(itemRow.is_featured),
      dietaryTags: Array.isArray(itemRow.dietary_tags) ? (itemRow.dietary_tags as string[]) : [],
      allergens: Array.isArray(itemRow.allergens) ? (itemRow.allergens as string[]) : [],
      sortOrder: num(itemRow.sort_order),
      availability: {},
      variants: [],
      addonGroups: [],
    },
    variant,
    unitPrice: toMoney(unitPrice),
    addonsTotal: toMoney(addonsTotal),
    addons: resolvedAddons,
  };
}

export async function addItemToCart(
  params: { cartId: string; restaurantId: string; timezone: string; input: AddItemInput },
  ctx: RequestContext,
): Promise<CartItem> {
  const db = getDb({ restaurantId: params.restaurantId });
  const quantity = Math.min(Math.max(Math.trunc(params.input.quantity ?? 1), 1), 99);

  return db.asRuntime(ctx, async (tx) => {
    const resolved = await resolveItemSelection(tx, params.restaurantId, params.timezone, params.input);
    const lineTotal = round2(dec(resolved.unitPrice).plus(dec(resolved.addonsTotal)).times(quantity));

    const row = await tx.queryOne<Row>(
      `insert into cart_items
         (cart_id, restaurant_id, menu_item_id, variant_id, quantity, special_instructions,
          item_name, variant_name, unit_price, addons_total, line_total)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9::numeric,$10::numeric,$11::numeric)
       returning *`,
      [
        params.cartId, params.restaurantId, resolved.item.id, resolved.variant?.id ?? null, quantity,
        params.input.specialInstructions?.slice(0, 300) ?? null, resolved.item.name,
        resolved.variant?.name ?? null, resolved.unitPrice, resolved.addonsTotal, toMoney(lineTotal),
      ],
    );
    if (!row) throw errors.internal("Unable to add the item to your cart");

    for (const addon of resolved.addons) {
      await tx.query(
        `insert into cart_item_addons
           (cart_item_id, menu_addon_id, addon_group_id, group_name, addon_name, unit_price, quantity)
         values ($1,$2,$3,$4,$5,$6::numeric,$7)`,
        [str(row.id), addon.addonId, addon.groupId, addon.groupName, addon.name, addon.price, addon.quantity],
      );
    }

    await tx.query(`update carts set updated_at = now() where id = $1`, [params.cartId]);

    const addonRows = await tx.query<Row>(`select * from cart_item_addons where cart_item_id = $1`, [str(row.id)]);
    return mapCartItem({ ...row, is_available: true }, addonRows.map(mapCartAddon));
  });
}

export async function updateCartItemQuantity(
  params: { cartItemId: string; quantity: number },
  ctx: RequestContext,
): Promise<void> {
  const db = getDb(ctx);
  await db.asRuntime(ctx, async (tx) => {
    if (params.quantity <= 0) {
      await tx.query(`delete from cart_items where id = $1`, [params.cartItemId]);
      return;
    }
    const quantity = Math.min(Math.trunc(params.quantity), 99);
    await tx.query(
      `update cart_items set quantity = $2::int,
              line_total = round((unit_price + addons_total) * $2::numeric, 2),
              updated_at = now()
        where id = $1`,
      [params.cartItemId, quantity],
    );
  });
}

export async function removeCartItem(cartItemId: string, ctx: RequestContext): Promise<void> {
  await getDb(ctx).asRuntime(ctx, async (tx) => {
    await tx.query(`delete from cart_items where id = $1`, [cartItemId]);
  });
}

export async function setCartOrderType(cartId: string, orderType: OrderType, ctx: RequestContext): Promise<void> {
  await getDb(ctx).asRuntime(ctx, async (tx) => {
    await tx.query(`update carts set order_type = $2, updated_at = now() where id = $1`, [cartId, orderType]);
  });
}

export async function setCartCoupon(
  cartId: string,
  coupon: { id: string; code: string } | null,
  ctx: RequestContext,
): Promise<void> {
  await getDb(ctx).asRuntime(ctx, async (tx) => {
    await tx.query(`update carts set coupon_id = $2, coupon_code = $3, updated_at = now() where id = $1`, [
      cartId,
      coupon?.id ?? null,
      coupon?.code ?? null,
    ]);
  });
}

export async function setCartLocation(cartId: string, locationId: string, ctx: RequestContext): Promise<void> {
  await getDb(ctx).asRuntime(ctx, async (tx) => {
    await tx.query(`update carts set location_id = $2, updated_at = now() where id = $1`, [cartId, locationId]);
  });
}

export async function clearCart(cartId: string, ctx: RequestContext): Promise<void> {
  await getDb(ctx).asRuntime(ctx, async (tx) => {
    await tx.query(`delete from cart_items where cart_id = $1`, [cartId]);
    await tx.query(`update carts set coupon_id = null, coupon_code = null, updated_at = now() where id = $1`, [cartId]);
  });
}

export async function countActiveCarts(restaurantId: string, ctx: RequestContext): Promise<number> {
  const db = getDb({ restaurantId });
  return db.read(ctx, async (tx) => {
    const row = await tx.queryOne<{ count: string }>(
      `select count(*) from carts where restaurant_id = $1 and status = 'active' and exists (
         select 1 from cart_items ci where ci.cart_id = carts.id)`,
      [restaurantId],
    );
    return row ? Number.parseInt(row.count, 10) : 0;
  });
}
