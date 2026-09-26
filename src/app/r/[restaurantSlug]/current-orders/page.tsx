import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { getVisitorContext } from "@/web/session";
import { requireStorefront } from "@/web/storefront";
import { getMyOrders } from "@/server/services/orders";
import { CurrentOrderCard } from "@/components/storefront/my-order-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/storefront/empty-state";
import { PageHero } from "@/components/storefront/page-hero";
import { resolveImage } from "@/web/media";

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
    <>
      <PageHero
        overlay
        size="sm"
        image={resolveImage(restaurant.coverUrl)}
        eyebrow="Live"
        title={current.length > 1 ? "Current orders" : "Current order"}
        subtitle="Live status for every order in progress right now."
      />
      <div className="container-page py-10 md:py-12">
        {current.length ? (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-2">
            {current.map((order) => (
              <CurrentOrderCard key={order.id} order={order} restaurant={card} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={ClipboardList}
            title="No active order"
            data-testid="no-current-order"
            actions={
              <Button asChild size="lg">
                <Link href={menuHref}>Browse the menu</Link>
              </Button>
            }
          >
            When you place an order it shows up here and updates live until it is ready.
          </EmptyState>
        )}
      </div>
    </>
  );
}
