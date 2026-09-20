import { ORDER_TYPES, type OrderType } from "./contract/enums";
import type { RestaurantFeatures } from "./contract/settings";

/** Single source of truth for "does this restaurant offer this order type". */
export function isOrderTypeEnabled(features: RestaurantFeatures, orderType: OrderType): boolean {
  if (orderType === "delivery") return features.delivery;
  if (orderType === "pickup") return features.pickup;
  return features.dineIn;
}

export function enabledOrderTypes(features: RestaurantFeatures, candidates: readonly OrderType[] = ORDER_TYPES): OrderType[] {
  return candidates.filter((orderType) => isOrderTypeEnabled(features, orderType));
}
