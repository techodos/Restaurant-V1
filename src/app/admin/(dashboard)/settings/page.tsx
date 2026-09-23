import type { Metadata } from "next";
import { getAdminRestaurant } from "@/web/admin";
import { requirePermission } from "@/web/session";
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

export default async function AdminSettingsPage() {
  const actor = await requirePermission("settings.view");
  const restaurant = await getAdminRestaurant();
  const readOnly = !actor.permissions.includes("settings.manage");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="mt-1 text-[var(--color-muted-ink)]">{restaurant.name}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <FeaturesSection features={restaurant.features} readOnly={readOnly} />
        <TaxSection tax={restaurant.settings.tax} readOnly={readOnly} />
        <ServiceFeeSection serviceFee={restaurant.settings.serviceFee} readOnly={readOnly} />
        <OrderingSection ordering={restaurant.settings.ordering} readOnly={readOnly} />
        <PaymentsSettingsSection payments={restaurant.settings.payments} readOnly={readOnly} />
        <ReservationsSettingsSection reservations={restaurant.settings.reservations} readOnly={readOnly} />
        <DeliverySettingsSection delivery={restaurant.settings.delivery} readOnly={readOnly} />
        <LoyaltySection loyalty={restaurant.settings.loyalty} readOnly={readOnly} />
        <ReceiptSection receipt={restaurant.settings.receipt} readOnly={readOnly} />
      </div>
    </div>
  );
}
