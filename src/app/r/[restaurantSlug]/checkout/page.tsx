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
import { signInHref } from "@/shared/return-to";

interface CheckoutPageProps {
  params: Promise<{ restaurantSlug: string }>;
}

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };

export default async function CheckoutPage({ params }: CheckoutPageProps) {
  const { restaurantSlug } = await params;

  const context = await requireStorefront(restaurantSlug);

  const { restaurant, primaryLocation } = context;
  // Orders are for signed-in customers only (placeOrderAction enforces it; this sends a guest to sign in
  // and straight back here). An unverified customer stays: the form shows the verify-code step.
  const customer = await getStorefrontCustomer(restaurant.id);
  if (!customer) redirect(signInHref(restaurant.slug, `/r/${restaurant.slug}/checkout`));

  const cart = await readCart(restaurant);
  if (!cart || cart.items.length === 0) redirect(`/r/${restaurant.slug}/menu`);

  const availability = serviceAvailability(restaurant, primaryLocation, cart.orderType);
  const [pricingResult, zones] = await Promise.all([
    priceCart(restaurant, cart),
    cart.orderType === "delivery"
      ? getLiveDeliveryZones(restaurant.id, {
          locationId: cart.locationId ?? undefined,
          activeOnly: true,
        })
      : Promise.resolve([]),
  ]);
  const emailVerified = await isEmailVerified(customer.userId);

  const { orderTypes: orderTypeOptions, paymentMethods } = getCheckoutOptions(restaurant);

  if (!pricingResult.pricing || pricingResult.blockers.length > 0 || !availability.acceptsOrders) {
    const reason = pricingResult.blockers[0] ?? availability.message;
    return (
      <div className="container-page py-16">
        <div className="mx-auto max-w-lg text-center">
          <p className="eyebrow mb-4 justify-center">Checkout</p>
          <h1 className="display-2">We cannot take this order yet</h1>
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
    <div className="container-page pb-12 pt-6 md:pb-16 md:pt-10">
      <header className="border-b border-[var(--rule)] pb-6">
        <Link
          href={`/r/${restaurant.slug}/cart`}
          className="group mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-muted-ink)] transition-colors hover:text-[var(--color-ink)]"
        >
          <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5" aria-hidden />
          Back to tray
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="eyebrow mb-3">Almost there</p>
            <h1 className="display-1">Checkout</h1>
            <p className="tabular mt-3 text-[15px] text-[var(--color-muted-ink)]">
              {cart.itemCount} item{cart.itemCount === 1 ? "" : "s"} from {restaurant.name}
            </p>
          </div>
          <ol aria-label="Order progress" className="flex items-center gap-2 text-[13px] font-medium">
            <li className="text-[var(--color-muted-ink)]">Tray</li>
            <li aria-hidden className="h-px w-6 bg-[var(--rule-strong)]" />
            <li aria-current="step" className="text-[var(--color-ink)]">Checkout</li>
            <li aria-hidden className="h-px w-6 bg-[var(--rule-strong)]" />
            <li className="text-[var(--color-muted-ink)]">Tracking</li>
          </ol>
        </div>
      </header>

      <div className="mt-8">
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
          defaultCity={primaryLocation?.city ?? ""}
        />
      </div>
    </div>
  );
}
