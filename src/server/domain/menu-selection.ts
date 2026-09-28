import { dec, sumMoney, toMoney } from "@/shared/money";
import { isWindowActive } from "@/shared/hours";
import type { AvailabilityWindow, MenuItem } from "@/shared/contract/models";
import { PricingError } from "./pricing";

/**
 * Resolves one tray line (item + variant + add-ons) against a menu item: availability, variant and
 * add-on rules, and the canonical unit price / add-ons total. Pure — the SAME function prices the
 * tray preview from the in-memory storefront menu (cart page, checkout page) and the order itself
 * from rows read inside the order transaction (`createOrder`), so the number a customer is shown and
 * the number they are charged come from one implementation. Throws `PricingError` on a line that
 * cannot be ordered, exactly as the database path always has.
 */

export interface OrderableMenuItem {
  /** variants/add-on groups may include unavailable/inactive ones; they are filtered here */
  item: MenuItem;
  /** null when the item's category is missing or inactive */
  category: { isActive: boolean; availability: AvailabilityWindow } | null;
}

export interface SelectionInput {
  menuItemId: string;
  variantId?: string | null;
  quantity?: number;
  addons?: { addonId: string; quantity?: number }[];
}

export interface ResolvedSelection {
  item: MenuItem;
  variant: { id: string; name: string; price: string } | null;
  unitPrice: string;
  addonsTotal: string;
  addons: { addonId: string; groupId: string; groupName: string; name: string; price: string; quantity: number }[];
}

export function resolveMenuSelection(
  entry: OrderableMenuItem | null | undefined,
  input: SelectionInput,
  timezone: string,
  now = new Date(),
): ResolvedSelection {
  if (!entry) throw new PricingError("ITEM_UNAVAILABLE", "That item is no longer on the menu.");
  const { item, category } = entry;
  if (!item.isActive || !item.isAvailable || !category?.isActive) {
    throw new PricingError("ITEM_UNAVAILABLE", "That item is currently unavailable.", { itemId: item.id });
  }
  if (!isWindowActive(item.availability ?? {}, now, timezone) || !isWindowActive(category.availability ?? {}, now, timezone)) {
    throw new PricingError("ITEM_UNAVAILABLE", "That item is not being served right now.", { itemId: item.id });
  }

  const variants = item.variants
    .filter((variant) => variant.isAvailable)
    .sort((a, b) => a.sortOrder - b.sortOrder || dec(a.price).comparedTo(dec(b.price)));
  let variant: ResolvedSelection["variant"] = null;
  let unitPrice = dec(item.basePrice);

  if (variants.length > 0) {
    const requested = input.variantId
      ? variants.find((candidate) => candidate.id === input.variantId)
      : (variants.find((candidate) => candidate.isDefault) ?? null);

    if (input.variantId && !requested) {
      throw new PricingError("VARIANT_INVALID", "The selected option is not available.", { itemId: item.id });
    }
    if (!requested && variants.some((candidate) => candidate.isDefault)) {
      throw new PricingError("VARIANT_REQUIRED", "Please choose an option for this item.", { itemId: item.id });
    }
    if (requested) {
      const variantPrice = dec(requested.price);
      unitPrice = requested.priceMode === "delta" ? dec(item.basePrice).plus(variantPrice) : variantPrice;
      variant = { id: requested.id, name: requested.name, price: toMoney(variantPrice) };
    } else if (!input.variantId) {
      throw new PricingError("VARIANT_REQUIRED", "Please choose an option for this item.", { itemId: item.id });
    }
  }

  const groups = item.addonGroups
    .filter((group) => group.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  const addons = groups.flatMap((group) => group.addons.filter((addon) => addon.isAvailable));

  const resolvedAddons: ResolvedSelection["addons"] = [];
  const addonIds = new Set<string>();

  for (const selection of input.addons ?? []) {
    if (addonIds.has(selection.addonId)) continue; // duplicate guard; quantity handles repeats
    const addon = addons.find((candidate) => candidate.id === selection.addonId);
    if (!addon) {
      throw new PricingError("ADDON_INVALID", "One of the selected extras is not available.", { addonId: selection.addonId });
    }
    const group = groups.find((candidate) => candidate.id === addon.addonGroupId);
    if (!group) continue;
    const maxQuantity = Math.max(1, addon.maxQuantity || 1);
    const quantity = Math.min(Math.max(1, Math.trunc(selection.quantity ?? 1)), maxQuantity);
    addonIds.add(selection.addonId);
    resolvedAddons.push({
      addonId: addon.id,
      groupId: group.id,
      groupName: group.name,
      name: addon.name,
      price: toMoney(addon.price),
      quantity,
    });
  }

  // Defaults first: a group not satisfied by the explicit selection gets its default add-ons before
  // min_select is enforced, so a customer can add a pizza without re-picking the house crust.
  for (const group of groups) {
    const minSelect = group.minSelect;
    if (minSelect <= 0) continue;
    const alreadySelected = resolvedAddons.filter((addon) => addon.groupId === group.id).length;
    if (alreadySelected >= minSelect) continue;
    const defaults = addons
      .filter((addon) => addon.addonGroupId === group.id && addon.isDefault)
      .slice(0, minSelect - alreadySelected);
    for (const addon of defaults) {
      if (addonIds.has(addon.id)) continue;
      addonIds.add(addon.id);
      resolvedAddons.push({ addonId: addon.id, groupId: group.id, groupName: group.name, name: addon.name, price: toMoney(addon.price), quantity: 1 });
    }
  }

  for (const group of groups) {
    const selected = resolvedAddons.filter((addon) => addon.groupId === group.id);
    const maxSelect = Math.max(1, group.maxSelect || 1);
    if (selected.length < group.minSelect) {
      throw new PricingError("ADDON_REQUIRED", `Choose at least ${group.minSelect} option(s) for ${group.name}.`, {
        groupId: group.id,
        groupName: group.name,
        minSelect: group.minSelect,
      });
    }
    if (selected.length > maxSelect) {
      throw new PricingError("ADDON_LIMIT", `Choose at most ${maxSelect} option(s) for ${group.name}.`, {
        groupId: group.id,
        groupName: group.name,
        maxSelect,
      });
    }
  }

  return {
    item,
    variant,
    unitPrice: toMoney(unitPrice),
    addonsTotal: toMoney(sumMoney(resolvedAddons.map((addon) => dec(addon.price).times(addon.quantity)))),
    addons: resolvedAddons,
  };
}
