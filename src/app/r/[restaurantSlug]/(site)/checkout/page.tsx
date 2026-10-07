import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getStorefrontCustomer, getVisitorContext } from "@/web/session";
import { isSupportedCountry } from "libphonenumber-js";
import { getCustomerProfile } from "@/server/services/customer-profile";
import { getBranching, readTrayView, requireStorefront } from "@/web/storefront";
import { branchesFor } from "@/shared/branching";
import { priceTray, serviceAvailability } from "@/server/services/cart";
import { getCheckoutOptions } from "@/server/services/checkout";
import { getDeliveryZones } from "@/server/services/restaurants";
import { config } from "@/server/config";
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

  const { restaurant, primaryLocation, locations } = context;
  // Orders are for signed-in customers only (placeOrderAction enforces it; this sends a guest to sign in
  // and straight back here). An unverified customer stays: the form shows the verify-code step.
  const customer = await getStorefrontCustomer(restaurant.id);
  if (!customer) redirect(signInHref(restaurant.slug, `/r/${restaurant.slug}/checkout`));

  // The tray is the browser's cookie and is priced from the in-memory menu, zones and coupon definitions:
  // no database. The page makes exactly one database read — the account's own profile (saved mobile,
  // addresses, email verification) in one transaction. The order itself re-prices everything from the
  // database when it is placed.
  const { tray, view } = await readTrayView(context);
  if (view.lines.length === 0) redirect(`/r/${restaurant.slug}/menu`);

  // Multi-branch ordering: checkout continues the branch chosen on the menu. Without a branch that can
  // serve this order there is nothing to check out yet — the menu's bar says what is missing.
  const branching = await getBranching(context);
  const branch = branching ? (branchesFor(branching, tray.orderType).find((option) => option.id === tray.locationId) ?? null) : null;
  if (branching && !branch) redirect(`/r/${restaurant.slug}/menu`);

  const availability = serviceAvailability(restaurant, primaryLocation, tray.orderType);
  const zones =
    tray.orderType === "delivery"
      ? await getDeliveryZones(restaurant.id, { locationId: tray.locationId ?? undefined, activeOnly: true })
      : [];
  // the same profile the header drawer shows: account email, saved mobile, saved addresses (and the
  // identity a customer-restricted coupon is checked against)
  const profile = await getCustomerProfile(restaurant, await getVisitorContext(restaurant.id));
  const pricingResult = await priceTray(restaurant, tray, view, {
    zones,
    customer: { email: profile.email, phone: profile.phone },
  });
  const emailVerified = profile.emailVerified;
  const couponCode = pricingResult.coupon?.code ?? null;

  const { orderTypes: orderTypeOptions, paymentMethods } = getCheckoutOptions(restaurant, tray.orderType);

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
          Back to cart
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="eyebrow mb-3">Almost there</p>
            <h1 className="display-1">Checkout</h1>
            <p className="tabular mt-3 text-[15px] text-[var(--color-muted-ink)]">
              {view.itemCount} item{view.itemCount === 1 ? "" : "s"} from {restaurant.name}
            </p>
          </div>
          <ol aria-label="Order progress" className="flex items-center gap-2 text-[13px] font-medium">
            <li className="text-[var(--color-muted-ink)]">Cart</li>
            <li aria-hidden className="h-px w-6 bg-[var(--rule-strong)]" />
            <li aria-current="step" className="text-[var(--color-ink)]">Checkout</li>
            <li aria-hidden className="h-px w-6 bg-[var(--rule-strong)]" />
            <li className="text-[var(--color-muted-ink)]">Tracking</li>
          </ol>
        </div>
      </header>

      {pricingResult.couponNotice ? (
        <p role="status" className="mt-6 rounded-[var(--radius-card)] bg-[var(--steel-2)] p-3.5 text-sm text-[var(--color-muted-ink)]">
          {pricingResult.couponNotice}
        </p>
      ) : null}

      <div className="mt-8">
        <CheckoutForm
          restaurantSlug={restaurant.slug}
          orderType={tray.orderType}
          orderTypeOptions={orderTypeOptions}
          items={view.lines.map((line) => ({
            name: line.name,
            quantity: line.line.quantity,
            variantName: line.variantName,
            addonNames: line.addons.map((addon) => addon.name),
            lineTotal: line.lineTotal,
          }))}
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
          couponCode={couponCode}
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
          accountEmail={profile.email}
          savedPhone={profile.phone}
          savedAddresses={profile.addresses}
          phoneCountry={isSupportedCountry(restaurant.country) ? restaurant.country : "PK"}
          locations={locations}
          initialLocationId={tray.locationId}
          branch={branch ? { name: branch.name, menuHref: `/r/${restaurant.slug}/menu`, destination: branching?.destination ?? null } : null}
          googleMapsApiKey={config.maps?.apiKey ?? null}
        />
      </div>
    </div>
  );
}
