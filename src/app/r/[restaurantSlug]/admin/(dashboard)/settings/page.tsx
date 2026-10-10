import type { Metadata } from "next";
import { getAdminRestaurantFresh } from "@/web/admin";
import { requireAdminPage } from "@/web/session";
import { entitledPaymentMethods } from "@/shared/feature-access";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  DeliverySettingsSection,
  FeaturesSection,
  LoyaltySection,
  OrderingSection,
  PaymentsSettingsSection,
  ReceiptSection,
  ReservationsSettingsSection,
  ServiceFeeSection,
  TaxSection,
} from "@/components/admin/settings-sections";

export const dynamic = "force-dynamic";

const SECTIONS = [
  { id: "features", label: "Features" },
  { id: "tax", label: "Tax" },
  { id: "serviceFee", label: "Service fee" },
  { id: "payments", label: "Payments" },
  { id: "ordering", label: "Ordering" },
  { id: "reservations", label: "Reservations" },
  { id: "delivery", label: "Delivery" },
  { id: "loyalty", label: "Loyalty" },
  { id: "receipt", label: "Receipt" },
] as const;
export const metadata: Metadata = { title: "Settings" };

export default async function AdminSettingsPage({ params }: { params: Promise<{ restaurantSlug: string }> }) {
  const { restaurantSlug } = await params;
  const actor = await requireAdminPage("settings.view", restaurantSlug);
  // fresh, not the 30 s admin cache: these forms save what they show
  const restaurant = await getAdminRestaurantFresh(restaurantSlug);
  const readOnly = !actor.permissions.includes("settings.manage");

  return (
    <div className="space-y-5">
      <AdminPageHeader title="Settings" description={`How ${restaurant.name} takes orders, charges and books tables. Each section saves on its own.`} />

      <div className="grid items-start gap-6 lg:grid-cols-[12.5rem_minmax(0,1fr)]">
        {/* jump links to each section's anchor (SectionForm renders id="settings-<section>") */}
        <nav aria-label="Settings sections" className="scrollbar-none -mx-4 overflow-x-auto px-4 lg:sticky lg:top-24 lg:mx-0 lg:overflow-visible lg:px-0">
          <ul className="flex gap-1 lg:surface-card lg:flex-col lg:p-1.5">
            {SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  href={`#settings-${section.id}`}
                  className="block whitespace-nowrap rounded-[var(--radius-brand)] px-3 py-2 text-[13px] font-medium text-[var(--color-muted-ink)] transition-colors hover:bg-[var(--tint)] hover:text-[var(--color-ink)]"
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-6">
          <FeaturesSection features={restaurant.ownerFeatures} entitlements={restaurant.entitlements} readOnly={readOnly} />
          <TaxSection tax={restaurant.settings.tax} readOnly={readOnly} />
          <ServiceFeeSection serviceFee={restaurant.settings.serviceFee} readOnly={readOnly} />
          {/* Payments sits right above Ordering on purpose: Ordering's "self-cancellation" callout refers to it. */}
          <PaymentsSettingsSection payments={restaurant.settings.payments} entitlements={restaurant.entitlements} readOnly={readOnly} />
          <OrderingSection
            ordering={restaurant.settings.ordering}
            enabledPaymentMethods={entitledPaymentMethods(restaurant.settings.payments.enabledMethods, restaurant.entitlements)}
            readOnly={readOnly}
          />
          <ReservationsSettingsSection reservations={restaurant.settings.reservations} readOnly={readOnly} />
          <DeliverySettingsSection delivery={restaurant.settings.delivery} readOnly={readOnly} />
          <LoyaltySection loyalty={restaurant.settings.loyalty} readOnly={readOnly} />
          <ReceiptSection receipt={restaurant.settings.receipt} readOnly={readOnly} />
        </div>
      </div>
    </div>
  );
}
