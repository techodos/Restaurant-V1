import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { getVisitorContext } from "@/web/session";
import { requireStorefront } from "@/web/storefront";
import { getMyOrders } from "@/server/services/orders";
import { CurrentOrderCard } from "@/components/storefront/my-order-card";
import { Button } from "@/components/ui/button";

interface CurrentOrdersPageProps {
  params: Promise<{ restaurantSlug: string }>;
}

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Current orders", robots: { index: false, follow: false } };

/**
 * Active orders only (pending … out for delivery) — reached from the floating widget in the layout,
 * or directly. Available to a guest (their own cart-token orders) as much as a signed-in customer
 * (all their active orders); history lives separately at /orders and needs an account. Ownership
 * comes from the request via getVisitorContext, never the URL.
 */
export default async function CurrentOrdersPage({ params }: CurrentOrdersPageProps) {
  const { restaurantSlug } = await params;
  const { restaurant } = await requireStorefront(restaurantSlug);
  const visitor = await getVisitorContext(restaurant.id);
  const { current } = await getMyOrders(restaurant.id, visitor);

  const card = {
    slug: restaurant.slug,
    name: restaurant.name,
    currencySymbol: restaurant.currencySymbol,
    locale: restaurant.locale,
    timezone: restaurant.timezone,
  };
  const menuHref = `/r/${restaurant.slug}/menu`;

  return (
    <div className="container-page py-10 md:py-14">
      <header>
        <h1 className="text-[2.25rem] font-semibold leading-[1.05] md:text-[3.25rem]">{current.length > 1 ? "Current orders" : "Current order"}</h1>
        <p className="mt-2 text-sm text-[var(--color-muted-ink)]">Live status for every order in progress right now.</p>
      </header>

      <div className="mx-auto mt-8 max-w-3xl md:mx-0">
        {current.length ? (
          <div className="space-y-4">
            {current.map((order) => (
              <CurrentOrderCard key={order.id} order={order} restaurant={card} />
            ))}
          </div>
        ) : (
          <div
            className="rounded-[var(--radius-brand)] border border-dashed border-[var(--color-hairline)] bg-[var(--color-surface)] p-8 text-center"
            data-testid="no-current-order"
          >
            <span className="mx-auto grid size-12 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-brand)_12%,transparent)] text-[var(--color-brand)]">
              <ClipboardList className="size-6" aria-hidden />
            </span>
            <h2 className="mt-4 text-lg font-semibold">No active order</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-muted-ink)]">
              When you place an order it shows up here and updates live until it is ready.
            </p>
            <Button asChild className="mt-5">
              <Link href={menuHref}>Browse the menu</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
