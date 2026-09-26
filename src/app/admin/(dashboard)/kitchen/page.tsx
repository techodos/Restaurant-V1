import type { Metadata } from "next";
import { ChefHat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getKitchenOrders } from "@/server/services/orders";
import { ORDER_TYPE_LABELS } from "@/shared/contract/enums";
import { getAdminRestaurant } from "@/web/admin";
import { requirePermission } from "@/web/session";
import { KitchenAutoRefresh } from "@/components/admin/kitchen-auto-refresh";
import { OrderStatusControl } from "@/components/admin/order-status-control";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Kitchen" };

function elapsedMinutes(createdAt: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(createdAt).getTime()) / 60000));
}

export default async function AdminKitchenPage() {
  const actor = await requirePermission("kitchen.view");
  const restaurant = await getAdminRestaurant();
  const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };

  const orders = await getKitchenOrders(restaurant.id, ctx);

  return (
    <div className="space-y-6">
      <KitchenAutoRefresh />
      <div>
        <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.02em]">Kitchen</h1>
        <p className="mt-1 text-[var(--color-muted-ink)]">{orders.length} active orders</p>
      </div>

      {orders.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center text-[var(--color-muted-ink)]">
            <ChefHat className="size-8" aria-hidden />
            <p>No active orders right now.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {orders.map((order) => {
            const minutes = elapsedMinutes(order.createdAt);
            return (
              <Card key={order.id} className={minutes >= 20 ? "border-[var(--color-danger)]" : undefined}>
                <CardHeader className="flex-row items-start justify-between gap-2 pb-3">
                  <div>
                    <CardTitle>{order.orderNumber}</CardTitle>
                    <p className="mt-1 text-xs text-[var(--color-muted-ink)]">
                      {ORDER_TYPE_LABELS[order.orderType]}
                      {order.tableNumber ? ` · Table ${order.tableNumber}` : ""}
                    </p>
                  </div>
                  <Badge variant={minutes >= 20 ? "danger" : "neutral"}>{minutes}m</Badge>
                </CardHeader>
                <CardContent className="space-y-3 pt-0">
                  <ul className="space-y-1.5 text-sm">
                    {(order.items ?? []).map((item) => (
                      <li key={item.id}>
                        <span className="font-medium">{item.quantity}×</span> {item.itemName}
                        {item.variantName ? <span className="text-[var(--color-muted-ink)]"> · {item.variantName}</span> : null}
                        {item.addons.length ? (
                          <ul className="ml-4 text-xs text-[var(--color-muted-ink)]">
                            {item.addons.map((addon) => (
                              <li key={addon.id}>
                                + {addon.addonName}
                                {addon.quantity > 1 ? ` ×${addon.quantity}` : ""}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {item.specialInstructions ? (
                          <p className="ml-4 text-xs italic text-[var(--color-muted-ink)]">“{item.specialInstructions}”</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  {order.specialInstructions ? (
                    <p className="rounded-[var(--radius-brand)] bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)] p-2 text-xs">
                      {order.specialInstructions}
                    </p>
                  ) : null}
                  <div className="border-t border-[var(--color-hairline)] pt-3">
                    <OrderStatusControl orderId={order.id} currentStatus={order.status} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
