import type { Metadata } from "next";
import { getAdminRestaurant } from "@/web/admin";
import { requirePermission } from "@/web/session";
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
export const metadata: Metadata = { title: "Settings" };

export default async function AdminSettingsPage({ params }: { params: Promise<{ restaurantSlug: string }> }) {
  const { restaurantSlug } = await params;
  const actor = await requirePermission("settings.view", restaurantSlug);
  const restaurant = await getAdminRestaurant(restaurantSlug);
  const readOnly = !actor.permissions.includes("settings.manage");

  return (
    <div className="space-y-6">
      <AdminPageHeader title="Settings" description={restaurant.name} />

      <div className="grid gap-6 lg:grid-cols-2">
        <FeaturesSection features={restaurant.features} readOnly={readOnly} />
        <TaxSection tax={restaurant.settings.tax} readOnly={readOnly} />
        <ServiceFeeSection serviceFee={restaurant.settings.serviceFee} readOnly={readOnly} />
        {/* Payments and Ordering sit side by side on purpose: Ordering's "self-cancellation" callout
            references the Payments card right next to it, instead of looking like a random duplicate
            of it elsewhere on the page. */}
        <PaymentsSettingsSection payments={restaurant.settings.payments} readOnly={readOnly} />
        <OrderingSection
          ordering={restaurant.settings.ordering}
          enabledPaymentMethods={restaurant.settings.payments.enabledMethods}
          readOnly={readOnly}
        />
        <ReservationsSettingsSection reservations={restaurant.settings.reservations} readOnly={readOnly} />
        <DeliverySettingsSection delivery={restaurant.settings.delivery} readOnly={readOnly} />
        <LoyaltySection loyalty={restaurant.settings.loyalty} readOnly={readOnly} />
        <ReceiptSection receipt={restaurant.settings.receipt} readOnly={readOnly} />
      </div>
    </div>
  );
}
