"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { updateSettingsAction } from "@/app/admin/(dashboard)/settings/actions";
import {
  ORDER_TYPES,
  ORDER_TYPE_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  type OrderType,
  type PaymentMethod,
} from "@/shared/contract/enums";
import type { RestaurantFeatures, RestaurantSettings } from "@/shared/contract/settings";
import type { SettingsSection } from "@/server/validation/settings";

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function SectionForm({
  title,
  description,
  section,
  patch,
  readOnly,
  children,
}: {
  title: string;
  description: string;
  section: "features" | SettingsSection;
  patch: () => unknown;
  readOnly: boolean;
  children: ReactNode;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(() => {
      updateSettingsAction(section, patch()).then((result) => {
        if (!result.success) {
          toast.error(result.error.message);
          return;
        }
        toast.success(`${title} saved.`);
        router.refresh();
      });
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <fieldset disabled={readOnly || pending} className="space-y-4">
            {children}
            {!readOnly ? (
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Save
              </Button>
            ) : null}
          </fieldset>
        </form>
      </CardContent>
    </Card>
  );
}

export function FeaturesSection({ features, readOnly }: { features: RestaurantFeatures; readOnly: boolean }) {
  const [state, setState] = useState(features);
  const flags: { key: keyof RestaurantFeatures; label: string }[] = [
    { key: "onlineOrdering", label: "Online ordering" },
    { key: "delivery", label: "Delivery" },
    { key: "pickup", label: "Pickup" },
    { key: "dineIn", label: "Dine-in" },
    { key: "reservations", label: "Reservations" },
    { key: "reviews", label: "Reviews" },
    { key: "coupons", label: "Coupons" },
    { key: "loyalty", label: "Loyalty" },
    { key: "gallery", label: "Gallery" },
    { key: "customDomain", label: "Custom domain" },
    { key: "analytics", label: "Analytics" },
    { key: "onlinePayments", label: "Online payments" },
    { key: "notifications", label: "Notifications" },
  ];

  return (
    <SectionForm title="Features" description="Turn storefront features on or off." section="features" patch={() => state} readOnly={readOnly}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {flags.map((flag) => (
          <Checkbox
            key={flag.key}
            label={flag.label}
            checked={Boolean(state[flag.key])}
            onChange={(value) => setState((current) => ({ ...current, [flag.key]: value }))}
          />
        ))}
      </div>
      <div className="border-t border-[var(--color-hairline)] pt-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-muted-ink)]">Notification channels</p>
        <div className="flex gap-4">
          <Checkbox
            label="Email"
            checked={state.notificationChannels.emailNotify}
            onChange={(value) =>
              setState((current) => ({ ...current, notificationChannels: { ...current.notificationChannels, emailNotify: value } }))
            }
          />
          <Checkbox
            label="Push"
            checked={state.notificationChannels.pushNotify}
            onChange={(value) =>
              setState((current) => ({ ...current, notificationChannels: { ...current.notificationChannels, pushNotify: value } }))
            }
          />
        </div>
      </div>
    </SectionForm>
  );
}

export function TaxSection({ tax, readOnly }: { tax: RestaurantSettings["tax"]; readOnly: boolean }) {
  const [state, setState] = useState(tax);
  return (
    <SectionForm title="Tax" description="Sales tax applied to orders." section="tax" patch={() => state} readOnly={readOnly}>
      <Checkbox label="Enabled" checked={state.enabled} onChange={(value) => setState((s) => ({ ...s, enabled: value }))} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="taxRate">Rate (%)</Label>
          <Input id="taxRate" type="number" min={0} max={50} step="0.01" value={state.rate} onChange={(e) => setState((s) => ({ ...s, rate: Number(e.target.value) }))} />
        </div>
        <div>
          <Label htmlFor="taxLabel">Label</Label>
          <Input id="taxLabel" value={state.label} onChange={(e) => setState((s) => ({ ...s, label: e.target.value }))} />
        </div>
      </div>
      <Checkbox
        label="Prices already include tax"
        checked={state.included}
        onChange={(value) => setState((s) => ({ ...s, included: value }))}
      />
      <Checkbox
        label="Apply on delivery fee"
        checked={state.applyOnDeliveryFee}
        onChange={(value) => setState((s) => ({ ...s, applyOnDeliveryFee: value }))}
      />
      <div>
        <Label htmlFor="taxRegNumber">Registration number (optional)</Label>
        <Input id="taxRegNumber" value={state.registrationNumber ?? ""} onChange={(e) => setState((s) => ({ ...s, registrationNumber: e.target.value }))} />
      </div>
    </SectionForm>
  );
}

export function ServiceFeeSection({ serviceFee, readOnly }: { serviceFee: RestaurantSettings["serviceFee"]; readOnly: boolean }) {
  const [state, setState] = useState(serviceFee);
  function toggleType(type: OrderType) {
    setState((s) => ({ ...s, orderTypes: s.orderTypes.includes(type) ? s.orderTypes.filter((t) => t !== type) : [...s.orderTypes, type] }));
  }
  return (
    <SectionForm title="Service fee" description="Extra fee applied per order type." section="serviceFee" patch={() => state} readOnly={readOnly}>
      <Checkbox label="Enabled" checked={state.enabled} onChange={(value) => setState((s) => ({ ...s, enabled: value }))} />
      <div>
        <Label htmlFor="serviceFeeRate">Rate (%)</Label>
        <Input id="serviceFeeRate" type="number" min={0} max={50} step="0.01" value={state.rate} onChange={(e) => setState((s) => ({ ...s, rate: Number(e.target.value) }))} className="max-w-40" />
      </div>
      <div>
        <Label>Applies to</Label>
        <div className="mt-1.5 flex flex-wrap gap-3">
          {ORDER_TYPES.map((type) => (
            <Checkbox key={type} label={ORDER_TYPE_LABELS[type]} checked={state.orderTypes.includes(type)} onChange={() => toggleType(type)} />
          ))}
        </div>
      </div>
    </SectionForm>
  );
}

export function OrderingSection({ ordering, readOnly }: { ordering: RestaurantSettings["ordering"]; readOnly: boolean }) {
  const [state, setState] = useState(ordering);
  return (
    <SectionForm title="Ordering" description="Online ordering rules." section="ordering" patch={() => state} readOnly={readOnly}>
      <Checkbox
        label="Online ordering enabled"
        checked={state.onlineOrderingEnabled}
        onChange={(value) => setState((s) => ({ ...s, onlineOrderingEnabled: value }))}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="minOrder">Minimum order amount</Label>
          <Input id="minOrder" type="number" min={0} value={state.minimumOrderAmount} onChange={(e) => setState((s) => ({ ...s, minimumOrderAmount: Number(e.target.value) }))} />
        </div>
        <div>
          <Label htmlFor="prepTime">Preparation time (minutes)</Label>
          <Input id="prepTime" type="number" min={0} max={240} value={state.preparationTimeMinutes} onChange={(e) => setState((s) => ({ ...s, preparationTimeMinutes: Number(e.target.value) }))} />
        </div>
        <div>
          <Label htmlFor="maxAdvance">Max advance booking (days)</Label>
          <Input id="maxAdvance" type="number" min={0} max={30} value={state.maxAdvanceDays} onChange={(e) => setState((s) => ({ ...s, maxAdvanceDays: Number(e.target.value) }))} />
        </div>
        <div>
          <Label htmlFor="packagingCharge">Packaging charge</Label>
          <Input id="packagingCharge" type="number" min={0} value={state.packagingCharge} onChange={(e) => setState((s) => ({ ...s, packagingCharge: Number(e.target.value) }))} />
        </div>
      </div>
      <Checkbox
        label="Allow scheduled orders"
        checked={state.allowScheduledOrders}
        onChange={(value) => setState((s) => ({ ...s, allowScheduledOrders: value }))}
      />
      <Checkbox
        label="Require phone verification"
        checked={state.requirePhoneVerification}
        onChange={(value) => setState((s) => ({ ...s, requirePhoneVerification: value }))}
      />
    </SectionForm>
  );
}

export function PaymentsSettingsSection({ payments, readOnly }: { payments: RestaurantSettings["payments"]; readOnly: boolean }) {
  const [state, setState] = useState(payments);
  function toggleMethod(method: PaymentMethod) {
    setState((s) => ({
      ...s,
      enabledMethods: s.enabledMethods.includes(method) ? s.enabledMethods.filter((m) => m !== method) : [...s.enabledMethods, method],
    }));
  }
  return (
    <SectionForm title="Payments" description="Accepted payment methods." section="payments" patch={() => state} readOnly={readOnly}>
      <div>
        <Label>Enabled methods</Label>
        <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PAYMENT_METHODS.map((method) => (
            <Checkbox key={method} label={PAYMENT_METHOD_LABELS[method]} checked={state.enabledMethods.includes(method)} onChange={() => toggleMethod(method)} />
          ))}
        </div>
      </div>
      <div>
        <Label htmlFor="onlineProvider">Online payment provider</Label>
        <Select id="onlineProvider" value={state.onlineProvider} onChange={(e) => setState((s) => ({ ...s, onlineProvider: e.target.value as typeof s.onlineProvider }))} className="max-w-48">
          <option value="none">None</option>
          <option value="stripe">Stripe</option>
          <option value="jazzcash">JazzCash</option>
        </Select>
      </div>
      <Checkbox label="Pay at store enabled" checked={state.payAtStoreEnabled} onChange={(value) => setState((s) => ({ ...s, payAtStoreEnabled: value }))} />
    </SectionForm>
  );
}

export function ReservationsSettingsSection({
  reservations,
  readOnly,
}: {
  reservations: RestaurantSettings["reservations"];
  readOnly: boolean;
}) {
  const [state, setState] = useState(reservations);
  return (
    <SectionForm
      title="Reservations"
      description="Table booking rules (per-table inventory is managed separately)."
      section="reservations"
      patch={() => ({ ...state, tables: undefined })}
      readOnly={readOnly}
    >
      <Checkbox label="Enabled" checked={state.enabled} onChange={(value) => setState((s) => ({ ...s, enabled: value }))} />
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="slotMinutes">Slot length (minutes)</Label>
          <Input id="slotMinutes" type="number" min={15} max={120} value={state.slotMinutes} onChange={(e) => setState((s) => ({ ...s, slotMinutes: Number(e.target.value) }))} />
        </div>
        <div>
          <Label htmlFor="minGuests">Min guests</Label>
          <Input id="minGuests" type="number" min={1} max={20} value={state.minGuests} onChange={(e) => setState((s) => ({ ...s, minGuests: Number(e.target.value) }))} />
        </div>
        <div>
          <Label htmlFor="maxGuests">Max guests</Label>
          <Input id="maxGuests" type="number" min={1} max={60} value={state.maxGuests} onChange={(e) => setState((s) => ({ ...s, maxGuests: Number(e.target.value) }))} />
        </div>
        <div>
          <Label htmlFor="resMaxAdvance">Max advance booking (days)</Label>
          <Input id="resMaxAdvance" type="number" min={1} max={90} value={state.maxAdvanceDays} onChange={(e) => setState((s) => ({ ...s, maxAdvanceDays: Number(e.target.value) }))} />
        </div>
        <div>
          <Label htmlFor="defaultDuration">Default duration (minutes)</Label>
          <Input id="defaultDuration" type="number" min={30} max={300} value={state.defaultDurationMinutes} onChange={(e) => setState((s) => ({ ...s, defaultDurationMinutes: Number(e.target.value) }))} />
        </div>
      </div>
      <Checkbox label="Auto-confirm bookings" checked={state.autoConfirm} onChange={(value) => setState((s) => ({ ...s, autoConfirm: value }))} />
    </SectionForm>
  );
}

export function DeliverySettingsSection({ delivery, readOnly }: { delivery: RestaurantSettings["delivery"]; readOnly: boolean }) {
  const [state, setState] = useState(delivery);
  return (
    <SectionForm title="Delivery" description="Default delivery behaviour (per-zone fees are under Delivery zones)." section="delivery" patch={() => state} readOnly={readOnly}>
      <Checkbox label="Enabled" checked={state.enabled} onChange={(value) => setState((s) => ({ ...s, enabled: value }))} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="defaultEta">Default ETA (minutes)</Label>
          <Input id="defaultEta" type="number" min={5} max={240} value={state.defaultEtaMinutes} onChange={(e) => setState((s) => ({ ...s, defaultEtaMinutes: Number(e.target.value) }))} />
        </div>
        <div>
          <Label htmlFor="freeDeliveryOver">Free delivery over (optional)</Label>
          <Input
            id="freeDeliveryOver"
            type="number"
            min={0}
            value={state.freeDeliveryOver ?? ""}
            onChange={(e) => setState((s) => ({ ...s, freeDeliveryOver: e.target.value ? Number(e.target.value) : null }))}
          />
        </div>
      </div>
      <Checkbox label="Delivery tracking enabled" checked={state.trackingEnabled} onChange={(value) => setState((s) => ({ ...s, trackingEnabled: value }))} />
    </SectionForm>
  );
}

export function LoyaltySection({ loyalty, readOnly }: { loyalty: RestaurantSettings["loyalty"]; readOnly: boolean }) {
  const [state, setState] = useState(loyalty);
  return (
    <SectionForm title="Loyalty" description="Points program." section="loyalty" patch={() => state} readOnly={readOnly}>
      <Checkbox label="Enabled" checked={state.enabled} onChange={(value) => setState((s) => ({ ...s, enabled: value }))} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="pointsPerUnit">Points per currency unit</Label>
          <Input id="pointsPerUnit" type="number" min={0} step="0.01" value={state.pointsPerCurrencyUnit} onChange={(e) => setState((s) => ({ ...s, pointsPerCurrencyUnit: Number(e.target.value) }))} />
        </div>
        <div>
          <Label htmlFor="redeemRate">Redeem rate</Label>
          <Input id="redeemRate" type="number" min={0} step="0.01" value={state.redeemRate} onChange={(e) => setState((s) => ({ ...s, redeemRate: Number(e.target.value) }))} />
        </div>
      </div>
    </SectionForm>
  );
}

export function ReceiptSection({ receipt, readOnly }: { receipt: RestaurantSettings["receipt"]; readOnly: boolean }) {
  const [state, setState] = useState(receipt);
  return (
    <SectionForm title="Receipt" description="Text shown on printed/emailed receipts." section="receipt" patch={() => state} readOnly={readOnly}>
      <div>
        <Label htmlFor="footerNote">Footer note</Label>
        <Textarea id="footerNote" value={state.footerNote ?? ""} onChange={(e) => setState((s) => ({ ...s, footerNote: e.target.value }))} maxLength={400} />
      </div>
      <Checkbox label="Show tax registration number" checked={state.showTaxNumber} onChange={(value) => setState((s) => ({ ...s, showTaxNumber: value }))} />
    </SectionForm>
  );
}
