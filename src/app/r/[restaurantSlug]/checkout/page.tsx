import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ORDER_TYPES, type OrderType, type PaymentMethod } from "@/lib/contract/enums";
import { listDeliveryZones } from "@/lib/db/deliveries";
import { EMPTY_CONTEXT } from "@/lib/db/pool";
import { resolveCustomerFromSession } from "@/lib/auth";
import { getStorefrontContext } from "@/lib/services/storefront";
import { priceCart, readCart, serviceAvailability } from "@/lib/services/cart";
import { CheckoutForm } from "@/components/storefront/checkout-form";
import { Button } from "@/components/ui/button";

interface CheckoutPageProps {
  params: Promise<{ restaurantSlug: string }>;
}

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };

export default async function CheckoutPage({ params }: CheckoutPageProps) {
  const { restaurantSlug } = await params;

  let context;
  try {
    context = await getStorefrontContext(restaurantSlug);
  } catch {
    notFound();
  }

  const { restaurant, primaryLocation } = context;
  const cart = await readCart(restaurant, {});
  if (!cart || cart.items.length === 0) redirect(`/r/${restaurant.slug}/menu`);

  const availability = serviceAvailability(restaurant, primaryLocation, cart.orderType);
  const [pricingResult, zones, customer] = await Promise.all([
    priceCart(restaurant, cart),
    cart.orderType === "delivery"
      ? listDeliveryZones(restaurant.id, EMPTY_CONTEXT, {
          locationId: cart.locationId ?? undefined,
          activeOnly: true,
        })
      : Promise.resolve([]),
    resolveCustomerFromSession(restaurant.slug),
  ]);

  const orderTypeOptions = ORDER_TYPES.filter((type) =>
    type === "delivery" ? restaurant.features.delivery : type === "pickup" ? restaurant.features.pickup : restaurant.features.dineIn,
  ) as OrderType[];

  // Online payment is only offered when the restaurant enabled it in the database
  // and a provider is actually configured — we never fake a successful payment.
  const enabledMethods = restaurant.settings.payments.enabledMethods.filter((method) => {
    if (method === "card_online") {
      return (
        restaurant.features.onlinePayments &&
        restaurant.settings.payments.onlineProvider !== "none" &&
        Boolean(process.env[`${restaurant.settings.payments.onlineProvider.toUpperCase()}_SECRET_KEY`])
      );
    }
    if (method === "bank_transfer") return restaurant.features.onlinePayments;
    return true;
  }) as PaymentMethod[];

  const paymentMethods: PaymentMethod[] = enabledMethods.length ? enabledMethods : ["cash"];

  if (!pricingResult.pricing || pricingResult.blockers.length > 0 || !availability.acceptsOrders) {
    const reason = pricingResult.blockers[0] ?? availability.message;
    return (
      <div className="container-page py-20">
        <div className="mx-auto max-w-lg rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-8 text-center">
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
      <header className="max-w-2xl">
        <h1 className="text-3xl font-semibold md:text-4xl">Checkout</h1>
        <p className="mt-2 text-[var(--color-muted-ink)]">
          {cart.itemCount} item{cart.itemCount === 1 ? "" : "s"} from {restaurant.name} · no account required
        </p>
      </header>

      <div className="mt-8 max-w-3xl">
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
