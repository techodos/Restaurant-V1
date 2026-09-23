import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, Phone, Receipt, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getOrderForStaff } from "@/server/services/orders";
import { ORDER_STATUS_LABELS, ORDER_TYPE_LABELS, PAYMENT_METHOD_LABELS } from "@/shared/contract/enums";
import { formatMoney } from "@/shared/money";
import { getAdminRestaurant } from "@/web/admin";
import { requirePermission } from "@/web/session";
import { orderStatusBadgeVariant } from "@/components/admin/order-status-badge";
import { OrderStatusControl } from "@/components/admin/order-status-control";

export const dynamic = "force-dynamic";

interface OrderDetailPageProps {
  params: Promise<{ orderNumber: string }>;
}

export async function generateMetadata({ params }: OrderDetailPageProps): Promise<Metadata> {
  const { orderNumber } = await params;
  return { title: `Order ${decodeURIComponent(orderNumber)}` };
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default async function AdminOrderDetailPage({ params }: OrderDetailPageProps) {
  const actor = await requirePermission("orders.view");
  const restaurant = await getAdminRestaurant();
  const { orderNumber } = await params;
  const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };

  const order = await getOrderForStaff(restaurant.id, decodeURIComponent(orderNumber), ctx);
  if (!order) notFound();

  const money = (value: string) => formatMoney(value, { currency: restaurant.currency });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/orders"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted-ink)] hover:text-[var(--color-ink)]"
        >
          <ArrowLeft className="size-4" aria-hidden /> Back to orders
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">Order {order.orderNumber}</h1>
          <Badge variant={orderStatusBadgeVariant(order.status)}>{ORDER_STATUS_LABELS[order.status]}</Badge>
        </div>
        <p className="mt-1 text-[var(--color-muted-ink)]">
          {ORDER_TYPE_LABELS[order.orderType]} · placed {formatDateTime(order.createdAt)}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Update status</CardTitle>
        </CardHeader>
        <CardContent>
          <OrderStatusControl orderId={order.id} currentStatus={order.status} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Items</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="divide-y divide-[var(--color-hairline)]">
              {(order.items ?? []).map((item) => (
                <li key={item.id} className="flex items-start justify-between gap-4 py-3">
                  <div>
                    <p className="text-sm font-medium">
                      {item.quantity} × {item.itemName}
                      {item.variantName ? <span className="text-[var(--color-muted-ink)]"> · {item.variantName}</span> : null}
                    </p>
                    {item.addons.length ? (
                      <ul className="mt-1 text-xs text-[var(--color-muted-ink)]">
                        {item.addons.map((addon) => (
                          <li key={addon.id}>
                            + {addon.addonName}
                            {addon.quantity > 1 ? ` ×${addon.quantity}` : ""}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {item.specialInstructions ? (
                      <p className="mt-1 text-xs italic text-[var(--color-muted-ink)]">“{item.specialInstructions}”</p>
                    ) : null}
                  </div>
                  <p className="whitespace-nowrap text-sm font-medium">{money(item.lineTotal)}</p>
                </li>
              ))}
            </ul>
            <dl className="mt-4 space-y-2 border-t border-[var(--color-hairline)] pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-[var(--color-muted-ink)]">Subtotal</dt>
                <dd>{money(order.subtotal)}</dd>
              </div>
              {Number(order.discountAmount) > 0 ? (
                <div className="flex justify-between text-emerald-700">
                  <dt>Discount{order.couponCode ? ` (${order.couponCode})` : ""}</dt>
                  <dd>− {money(order.discountAmount)}</dd>
                </div>
              ) : null}
              {Number(order.deliveryFee) > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-[var(--color-muted-ink)]">Delivery</dt>
                  <dd>{money(order.deliveryFee)}</dd>
                </div>
              ) : null}
              {Number(order.serviceFee) > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-[var(--color-muted-ink)]">Service fee</dt>
                  <dd>{money(order.serviceFee)}</dd>
                </div>
              ) : null}
              {Number(order.taxAmount) > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-[var(--color-muted-ink)]">Tax</dt>
                  <dd>{money(order.taxAmount)}</dd>
                </div>
              ) : null}
              {Number(order.tipAmount) > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-[var(--color-muted-ink)]">Tip</dt>
                  <dd>{money(order.tipAmount)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between border-t border-[var(--color-hairline)] pt-3 text-base font-semibold">
                <dt>Total</dt>
                <dd>{money(order.total)}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0 text-sm">
              <p className="font-medium">{order.customerName}</p>
              <p className="flex items-center gap-2 text-[var(--color-muted-ink)]">
                <Phone className="size-4" aria-hidden /> {order.customerPhone}
              </p>
              {order.customerEmail ? <p className="text-[var(--color-muted-ink)]">{order.customerEmail}</p> : null}
              {order.orderType === "delivery" && order.deliveryAddress ? (
                <p className="flex items-start gap-2 text-[var(--color-muted-ink)]">
                  <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {[order.deliveryAddress.line1, order.deliveryAddress.line2, order.deliveryAddress.area, order.deliveryAddress.city]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              ) : null}
              {order.orderType !== "delivery" ? (
                <p className="flex items-center gap-2 text-[var(--color-muted-ink)]">
                  <Store className="size-4" aria-hidden /> {order.locationName ?? restaurant.name}
                  {order.tableNumber ? ` · table ${order.tableNumber}` : ""}
                </p>
              ) : null}
              <p className="flex items-center gap-2 text-[var(--color-muted-ink)]">
                <Receipt className="size-4" aria-hidden /> {PAYMENT_METHOD_LABELS[order.paymentMethod]} · {order.paymentStatus}
              </p>
              {order.notes ? (
                <p className="mt-2 rounded-[var(--radius-brand)] bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)] p-3 text-[var(--color-muted-ink)]">
                  {order.notes}
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {(order.statusHistory ?? []).length === 0 ? (
                <p className="text-sm text-[var(--color-muted-ink)]">No history yet.</p>
              ) : (
                <ol className="space-y-3 text-sm">
                  {(order.statusHistory ?? []).map((event) => (
                    <li key={event.id} className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{ORDER_STATUS_LABELS[event.toStatus]}</p>
                        {event.changedByName ? <p className="text-xs text-[var(--color-muted-ink)]">by {event.changedByName}</p> : null}
                        {event.note ? <p className="text-xs italic text-[var(--color-muted-ink)]">“{event.note}”</p> : null}
                      </div>
                      <span className="whitespace-nowrap text-xs text-[var(--color-muted-ink)]">{formatDateTime(event.createdAt)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
