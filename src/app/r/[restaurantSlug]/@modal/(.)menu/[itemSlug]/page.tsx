import { notFound } from "next/navigation";
import { ORDER_TYPES, type OrderType } from "@/shared/contract/enums";
import { requireStorefront } from "@/web/storefront";
import { RouteSheet } from "@/components/motion/route-sheet";
import { DishDetail } from "@/components/storefront/dish-detail";
import { findMenuItemBySlug } from "@/server/services/catalog";

interface DishSheetProps {
  params: Promise<{ restaurantSlug: string; itemSlug: string }>;
  searchParams: Promise<{ orderType?: string }>;
}

/**
 * Opening a dish from anywhere in the storefront (menu, home, related dishes) intercepts
 * /r/<slug>/menu/<dish> and shows it as a sheet over the page the guest was browsing, so their place
 * on the menu is never lost. A reload or a shared link renders the full page (menu/[itemSlug]/page.tsx).
 */
export default async function DishSheet({ params, searchParams }: DishSheetProps) {
  const { restaurantSlug, itemSlug } = await params;
  const { orderType } = await searchParams;
  const context = await requireStorefront(restaurantSlug);
  const item = await findMenuItemBySlug(context.restaurant.id, itemSlug);
  if (!item || !item.isActive) notFound();

  const activeOrderType: OrderType = ORDER_TYPES.includes(orderType as OrderType)
    ? (orderType as OrderType)
    : context.config.ordering.defaultOrderType;

  return (
    <RouteSheet title={item.name} hideTitle description={item.description ?? item.name} size="lg">
      <DishDetail context={context} item={item} orderType={activeOrderType} variant="sheet" />
    </RouteSheet>
  );
}
