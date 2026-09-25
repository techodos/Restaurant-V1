import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getStorefrontCustomer } from "@/web/session";
import { readCart, requireStorefront } from "@/web/storefront";
import { priceCart, serviceAvailability } from "@/server/services/cart";
import { getCheckoutOptions } from "@/server/services/checkout";
import { getLiveDeliveryZones } from "@/server/services/restaurants";
import { isEmailVerified } from "@/server/services/customer-auth";
import { CheckoutForm } from "@/components/storefront/checkout-form";
import { Button } from "@/components/ui/button";

interface CheckoutPageProps {
  params: Promise<{ restaurantSlug: string }>;
}

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };

export default async function CheckoutPage({ params }: CheckoutPageProps) {
  const { restaurantSlug } = await params;

  const context = await requireStorefront(restaurantSlug);

  const { restaurant, primaryLocation } = context;
  const cart = await readCart(restaurant);
  if (!cart || cart.items.length === 0) redirect(`/r/${restaurant.slug}/menu`);

  const availability = serviceAvailability(restaurant, primaryLocation, cart.orderType);
  const [pricingResult, zones, customer] = await Promise.all([
    priceCart(restaurant, cart),
    cart.orderType === "delivery"
      ? getLiveDeliveryZones(restaurant.id, {
          locationId: cart.locationId ?? undefined,
          activeOnly: true,
        })
      : Promise.resolve([]),
    getStorefrontCustomer(restaurant.id),
  ]);
  const emailVerified = customer ? await isEmailVerified(customer.userId) : true;

  const { orderTypes: orderTypeOptions, paymentMethods } = getCheckoutOptions(restaurant);

  if (!pricingResult.pricing || pricingResult.blockers.length > 0 || !availability.acceptsOrders) {
    const reason = pricingResult.blockers[0] ?? availability.message;
    return (
      <div className="container-page py-20">
        <div className="mx-auto max-w-lg surface-flat p-8 text-center">
          <h1 className="text-2xl font-semibold">We cannot take this order yet</h1>
          <p className="mt-3 text-[var(--color-muted-ink)]">{reason}</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button asChild>
              <Link href={`/r/${restaurant.slug}/cart`}>Back to cart</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/r/${restaurant.slug}/menu`}>Edit items</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const pricing = pricingResult.pricing;

  return (
    <div className="container-page py-10 md:py-14">
      <header className="mx-auto max-w-3xl">
        <Link
          href={`/r/${restaurant.slug}/cart`}
          className="group mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-muted-ink)] transition-colors hover:text-[var(--color-ink)]"
        >
          <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" aria-hidden />
          Back to cart
        </Link>
        <h1 className="text-[2.25rem] font-semibold leading-[1.05] md:text-[3.25rem]">Checkout</h1>
        <p className="mt-2 text-[var(--color-muted-ink)]">
          {cart.itemCount} item{cart.itemCount === 1 ? "" : "s"} from {restaurant.name} · no account required
        </p>
      </header>

      <div className="mx-auto mt-8 max-w-3xl">
        <CheckoutForm
          restaurantSlug={restaurant.slug}
          orderType={cart.orderType}
          orderTypeOptions={orderTypeOptions}
          pricing={{
            subtotal: pricing.subtotal,
            discount: pricing.discount,
            deliveryFee: pricing.deliveryFee,
            serviceFee: pricing.serviceFee,
            tax: pricing.tax,
            taxLabel: pricing.taxLabel,
            taxIncluded: pricing.taxIncluded,
            total: pricing.total,
          }}
          couponCode={cart.couponCode}
          zones={zones.map((zone) => ({
            id: zone.id,
            name: zone.name,
            deliveryFee: zone.deliveryFee,
            minOrderAmount: zone.minOrderAmount,
          }))}
          paymentMethods={paymentMethods}
          currencySymbol={restaurant.currencySymbol}
          locale={restaurant.locale}
          isSignedIn={Boolean(customer)}
          emailVerified={emailVerified}
          customerDefaults={
            customer
              ? { fullName: customer.name, phone: "", email: "" }
              : null
          }
          allowGuestCheckout={context.config.ordering.allowGuestCheckout}
        />
      </div>
    </div>
  );
}
