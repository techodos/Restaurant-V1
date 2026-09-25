import type { Metadata } from "next";
import Link from "next/link";
import { History, LogIn } from "lucide-react";
import { getVisitorContext } from "@/web/session";
import { requireStorefront } from "@/web/storefront";
import { getMyOrders } from "@/server/services/orders";
import { PreviousOrderCard } from "@/components/storefront/my-order-card";
import { Button } from "@/components/ui/button";

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

  if (!signedIn) {
    return (
      <div className="container-page flex justify-center py-14 md:py-20">
        <div className="w-full max-w-md surface-flat p-8 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-brand)_12%,transparent)] text-[var(--color-brand)]">
            <LogIn className="size-6" aria-hidden />
          </span>
          <h1 className="mt-4 text-xl font-semibold">Sign in to see your orders</h1>
          <p className="mt-2 text-sm text-[var(--color-muted-ink)]">
            Sign in or create an account to view your previous orders. An order you have just placed stays available
            without an account — look for the order button in the corner of the screen.
          </p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button asChild>
              <Link href={`/r/${restaurantSlug}/account/sign-in`}>Sign in</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/r/${restaurantSlug}/account/sign-up`}>Sign up</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container-page py-10 md:py-14">
      <header>
        <h1 className="text-[2.25rem] font-semibold leading-[1.05] md:text-[3.25rem]">My orders</h1>
        <p className="mt-2 text-sm text-[var(--color-muted-ink)]">Your previous orders at {restaurant.name}.</p>
      </header>

      <div className="mx-auto mt-8 max-w-3xl md:mx-0">
        {previous.length ? (
          <div className="space-y-4">
            {previous.map((order) => (
              <PreviousOrderCard key={order.id} order={order} restaurant={card} />
            ))}
          </div>
        ) : (
          <p
            className="flex items-center gap-2 rounded-[var(--radius-brand)] border border-dashed border-[var(--color-hairline)] p-5 text-sm text-[var(--color-muted-ink)]"
            data-testid="no-previous-orders"
          >
            <History className="size-4 shrink-0" aria-hidden />
            Completed and cancelled orders will be listed here.
          </p>
        )}
      </div>
    </div>
  );
}
