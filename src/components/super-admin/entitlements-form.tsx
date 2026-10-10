"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, BriefcaseBusiness, CreditCard, Landmark, LayoutPanelLeft, ShoppingBag, Sparkles, UtensilsCrossed, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { saveEntitlementsAction } from "@/app/super-admin/actions";
import { Panel, SaveBar, SettingRow, StatusBadge } from "@/components/super-admin/ui";
import { ENTITLEMENT_KEYS, ENTITLEMENT_LABELS, PAYMENT_ENTITLEMENTS, PROVIDER_ENTITLEMENTS, type EntitlementKey, type RestaurantEntitlements } from "@/shared/feature-access";

/**
 * What each switch controls (UI copy only). Every key in ENTITLEMENT_KEYS appears in exactly one group below;
 * tests/section-editor.test.ts fails otherwise, so a new entitlement can never be missing from this screen.
 */
const DESCRIPTIONS: Record<EntitlementKey, string> = {
  onlineOrdering: "Customers can place orders on the storefront.",
  pickup: "Order ahead and collect at the restaurant.",
  delivery: "Delivery orders, delivery zones and fees.",
  BranchingFeature: "Customers choose a location and branch before adding to the cart.",
  dineIn: "Orders placed at the table.",
  reservations: "Table booking on the storefront and the reservations screen.",
  reviews: "Guest reviews and the moderation screen.",
  loyalty: "Loyalty points on orders.",
  coupons: "Promo codes at checkout and the coupons screen.",
  gallery: "Photo gallery on the storefront.",
  analytics: "Sales reports and analytics for the owner.",
  onlinePayments: "Card and wallet payments at checkout.",
  customDomain: "Serve the storefront on the restaurant's own domain.",
  notifications: "Order and reservation updates to customers.",
  emailNotify: "Owner may send notifications by email.",
  pushNotify: "Owner may send browser push notifications.",
  kitchen: "Live kitchen ticket screen.",
  customers: "Customer list and order history.",
  payments: "Payment transactions list.",
  locations: "Branch addresses, hours and map pins.",
  staff: "Staff accounts and roles.",
  pay_cash_on_delivery: "Pay the rider in cash on delivery orders.",
  pay_cash: "Pay in cash at the counter (pickup and dine-in).",
  pay_card_online: "Card payment online at checkout (also needs Online payments).",
  pay_card_terminal: "Card on the restaurant's terminal (pickup and dine-in).",
  pay_wallet: "Mobile wallet such as JazzCash (also needs Online payments).",
  pay_bank_transfer: "Bank transfer (also needs Online payments).",
  provider_stripe: "Stripe as the online gateway for card payments.",
  provider_jazzcash: "JazzCash as the online gateway for card and wallet payments.",
};

export const ENTITLEMENT_GROUPS: { title: string; description: string; icon: LucideIcon; keys: EntitlementKey[] }[] = [
  { title: "Ordering", description: "How customers can order.", icon: ShoppingBag, keys: ["onlineOrdering", "pickup", "delivery", "BranchingFeature"] },
  { title: "Dining", description: "In-restaurant experiences.", icon: UtensilsCrossed, keys: ["dineIn", "reservations"] },
  { title: "Engagement", description: "Bring guests back.", icon: Sparkles, keys: ["reviews", "loyalty", "coupons", "gallery"] },
  { title: "Business", description: "Payments, insight and branding.", icon: BriefcaseBusiness, keys: ["analytics", "onlinePayments", "customDomain"] },
  { title: "Notifications", description: "Customer updates and the channels the owner may use.", icon: Bell, keys: ["notifications", "emailNotify", "pushNotify"] },
  { title: "Admin screens", description: "Screens in the owner's admin. Off removes them from the sidebar and blocks their address.", icon: LayoutPanelLeft, keys: ["kitchen", "customers", "payments", "locations", "staff"] },
  { title: "Payment methods", description: "Methods the owner may offer in Settings > Payments. Off hides the method there and refuses it at checkout.", icon: CreditCard, keys: [...PAYMENT_ENTITLEMENTS] },
  { title: "Online payment providers", description: "Gateways the owner may pick in Settings > Payments. Off hides it there and checkout treats the restaurant as having no gateway.", icon: Landmark, keys: [...PROVIDER_ENTITLEMENTS] },
];

export function EntitlementsForm({ restaurantId, entitlements }: { restaurantId: string; entitlements: RestaurantEntitlements }) {
  const [saved, setSaved] = useState(entitlements);
  const [state, setState] = useState(entitlements);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const dirty = ENTITLEMENT_KEYS.some((key) => state[key] !== saved[key]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(() => {
      saveEntitlementsAction(restaurantId, state).then((result) => {
        if (!result.success) return void toast.error(result.error.message);
        setSaved(state);
        toast.success("Features saved.");
        router.refresh();
      });
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-[13px] text-[var(--color-muted-ink)]">
        Turning something off hides it from the owner&apos;s admin and switches it off on the storefront, whatever the owner chose. Their own setting is kept and comes back when you turn it on again.
      </p>
      <fieldset disabled={pending} className="gap-4 lg:columns-2 [&>section]:mb-4 [&>section]:break-inside-avoid">
        <legend className="sr-only">Features and admin screens</legend>
        {ENTITLEMENT_GROUPS.map((group) => {
          const on = group.keys.filter((key) => state[key]).length;
          return (
            <Panel
              key={group.title}
              title={group.title}
              description={group.description}
              icon={group.icon}
              meta={<StatusBadge tone={on === group.keys.length ? "success" : on === 0 ? "neutral" : "warning"} dot={false}>{on}/{group.keys.length} on</StatusBadge>}
              bodyClassName="divide-y divide-[var(--color-hairline)] py-4"
            >
              {group.keys.map((key) => (
                <SettingRow
                  key={key}
                  id={`ent-${key}`}
                  title={ENTITLEMENT_LABELS[key]}
                  description={DESCRIPTIONS[key]}
                  checked={state[key]}
                  onChange={(value) => setState((current) => ({ ...current, [key]: value }))}
                />
              ))}
            </Panel>
          );
        })}
      </fieldset>
      <SaveBar dirty={dirty} pending={pending} onDiscard={() => setState(saved)} />
    </form>
  );
}
