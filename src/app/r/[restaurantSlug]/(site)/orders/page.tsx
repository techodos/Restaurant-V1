import type { Metadata } from "next";
import Link from "next/link";
import { History, LogIn } from "lucide-react";
import { getVisitorContext } from "@/web/session";
import { requireStorefront } from "@/web/storefront";
import { getMyOrders } from "@/server/services/orders";
import { PreviousOrderCard } from "@/components/storefront/my-order-card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/storefront/empty-state";
import { PageHero } from "@/components/storefront/page-hero";
import { resolveImage } from "@/web/media";

interface MyOrdersPageProps {
  params: Promise<{ restaurantSlug: string }>;
}

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "My orders", robots: { index: false, follow: false } };

/**
 * My Orders = order history only (completed / cancelled), signed-in customers only. Active orders
 * live at /current-orders (also reachable from the floating widget), reusable by guests too — this
 * keeps "history requires an account" and "track what you just ordered" as two separate concerns
 * (see DECISIONS.md, "My Orders vs Current Orders"). Ownership still comes from the request (customer
 * session), never the URL; a guest is never shown another visitor's history.
 */
export default async function MyOrdersPage({ params }: MyOrdersPageProps) {
  const { restaurantSlug } = await params;
  const { restaurant } = await requireStorefront(restaurantSlug);
  const visitor = await getVisitorContext(restaurant.id);
  const { signedIn, previous } = await getMyOrders(restaurant.id, visitor);

  const card = {
    slug: restaurant.slug,
    name: restaurant.name,
    currencySymbol: restaurant.currencySymbol,
    locale: restaurant.locale,
    timezone: restaurant.timezone,
  };

  const hero = (subtitle: string) => (
    <PageHero overlay size="sm" image={resolveImage(restaurant.coverUrl)} eyebrow="Your account" title="My orders" subtitle={subtitle} />
  );

  if (!signedIn) {
    return (
      <>
        {hero(`Every order you have placed at ${restaurant.name}, in one place.`)}
        <div className="container-page">
          <EmptyState
            icon={LogIn}
            title="Sign in to see your orders"
            className="py-12 md:py-16"
            actions={
              <>
                <Button asChild size="lg">
                  <Link href={`/r/${restaurantSlug}/account/sign-in`}>Sign in</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href={`/r/${restaurantSlug}/account/sign-up`}>Sign up</Link>
                </Button>
              </>
            }
          >
            Sign in or create an account to view your previous orders. An order you have just placed stays available
            without an account: look for the order button in the corner of the screen.
          </EmptyState>
        </div>
      </>
    );
  }

  return (
    <>
      {hero(`Your previous orders at ${restaurant.name}.`)}
      <div className="container-page py-10 md:py-12">
        {previous.length ? (
          <ol className="border-b border-[var(--rule)]">
            {previous.map((order) => (
              <li key={order.id}>
                <PreviousOrderCard order={order} restaurant={card} />
              </li>
            ))}
          </ol>
        ) : (
          <EmptyState icon={History} title="No orders yet" data-testid="no-previous-orders">
            Completed and cancelled orders will be listed here.
          </EmptyState>
        )}
      </div>
    </>
  );
}
