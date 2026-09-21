"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FieldError, FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import { placeOrderAction } from "@/app/r/[restaurantSlug]/checkout/actions";
import { PAYMENT_METHOD_LABELS, type OrderType, type PaymentMethod } from "@/shared/contract/enums";
import { formatMoney } from "@/shared/money";
import type { DeliveryZone } from "@/shared/contract/models";

export interface CheckoutPricing {
  subtotal: string;
  discount: string;
  deliveryFee: string;
  serviceFee: string;
  tax: string;
  taxLabel: string;
  taxIncluded: boolean;
  total: string;
}

interface CheckoutFormProps {
  restaurantSlug: string;
  orderType: OrderType;
  orderTypeOptions: OrderType[];
  pricing: CheckoutPricing;
  couponCode: string | null;
  zones: Pick<DeliveryZone, "id" | "name" | "deliveryFee" | "minOrderAmount">[];
  paymentMethods: PaymentMethod[];
  currencySymbol: string;
  locale: string;
  isSignedIn: boolean;
  customerDefaults: { fullName: string; phone: string; email: string } | null;
  allowGuestCheckout: boolean;
}

/**
 * Checkout form. Field-level validation happens here for fast feedback; the
 * authoritative validation, pricing and coupon checks all run inside the server
 * action (createOrder) before anything is written.
 */
export function CheckoutForm({
  restaurantSlug,
  orderType,
  orderTypeOptions,
  pricing,
  couponCode,
  zones,
  paymentMethods,
  currencySymbol,
  locale,
  isSignedIn,
  customerDefaults,
  allowGuestCheckout,
}: CheckoutFormProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  // state updates are async; this closes the window in which a fast double-click could submit twice
  const submitting = useRef(false);
  const [orderTypeState, setOrderTypeState] = useState<OrderType>(orderType);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(paymentMethods[0] ?? "cash");
  const [tip, setTip] = useState("");
  const router = useRouter();

  const money = (value: string) => formatMoney(value, { currency: currencySymbol, locale });
  const tipOptions = useMemo(() => {
    const subtotal = Number(pricing.subtotal);
    return [0, Math.round(subtotal * 0.05), Math.round(subtotal * 0.1)].filter((value, index, all) => all.indexOf(value) === index);
  }, [pricing.subtotal]);

  const showOnlineNotice = paymentMethods.includes("card_online");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) ?? "").trim();

    const payload = {
      orderType: orderTypeState,
      fullName: value("fullName"),
      phone: value("phone"),
      email: value("email"),
      addressLine1: value("addressLine1"),
      addressLine2: value("addressLine2"),
      area: value("area"),
      city: value("city"),
      postalCode: value("postalCode"),
      deliveryZoneId: value("deliveryZoneId"),
      tableNumber: value("tableNumber"),
      guests: value("guests") ? Number(value("guests")) : undefined,
      paymentMethod,
      couponCode: couponCode ?? "",
      tipAmount: tip,
      notes: value("notes"),
    };

    const nextErrors: Record<string, string> = {};
    if (payload.fullName.length < 2) nextErrors.fullName = "Please enter your name.";
    if (!/^[+0-9()\s-]{7,}$/.test(payload.phone)) nextErrors.phone = "Please enter a reachable phone number.";
    if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) nextErrors.email = "That email looks incomplete.";
    if (orderTypeState === "delivery") {
      if (!payload.addressLine1) nextErrors.addressLine1 = "Where should we deliver?";
      if (!payload.area) nextErrors.area = "Please add your area so we can match a delivery zone.";
    }
    if (orderTypeState === "dine_in" && !payload.tableNumber && !payload.guests) {
      nextErrors.tableNumber = "Add a table number or the number of guests.";
    }
    if (tip && !/^\d+(\.\d{1,2})?$/.test(tip)) nextErrors.tip = "Enter a tip like 150 or 150.50";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      toast.error("Please check the highlighted fields.");
      return;
    }

    if (submitting.current) return;
    submitting.current = true;
    startTransition(async () => {
      try {
        const result = await placeOrderAction(restaurantSlug, payload);
        if (!result.success) {
          submitting.current = false;
          toast.error(result.error.message, { description: "Nothing has been charged." });
          return;
        }
        // stays locked while we navigate to the order page
        toast.success("Order received", {
          description: "Your order has been received. You will get a confirmation message soon.",
        });
        router.push(`/r/${restaurantSlug}/order/${result.data.orderNumber}`);
      } catch {
        submitting.current = false;
        toast.error("We could not confirm your order.", {
          description: "Check your connection, then try again. If the order page opens, it went through.",
        });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-8">
      <section className="rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-6">
        <h2 className="text-lg font-semibold">1. How would you like your order?</h2>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Order type">
          {orderTypeOptions.map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={orderTypeState === type}
              onClick={() => setOrderTypeState(type)}
              className={
                orderTypeState === type
                  ? "rounded-full border border-[var(--color-brand)] bg-[var(--color-brand)] px-4 py-2 text-sm text-[var(--color-brand-foreground)]"
                  : "rounded-full border border-[var(--color-hairline)] px-4 py-2 text-sm hover:border-[var(--color-brand)]"
              }
            >
              {type === "delivery" ? "Delivery" : type === "pickup" ? "Pickup" : "Dine-in"}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-6">
        <h2 className="text-lg font-semibold">2. Your details</h2>
        {!isSignedIn ? (
          <p className="mt-2 text-sm text-[var(--color-muted-ink)]">
            {allowGuestCheckout
              ? "No account needed — we only use these details for this order."
              : "Please sign in before checking out."}
          </p>
        ) : null}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              name="fullName"
              defaultValue={customerDefaults?.fullName ?? ""}
              autoComplete="name"
              aria-invalid={Boolean(errors.fullName)}
              required
            />
            <FieldError>{errors.fullName}</FieldError>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={customerDefaults?.phone ?? ""}
              autoComplete="tel"
              placeholder="+92 300 1234567"
              aria-invalid={Boolean(errors.phone)}
              required
            />
            <FieldHint>We call this number if the driver cannot find you.</FieldHint>
            <FieldError>{errors.phone}</FieldError>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="email">Email (optional)</Label>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={customerDefaults?.email ?? ""}
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
            />
            <FieldError>{errors.email}</FieldError>
          </div>
        </div>
      </section>

      {orderTypeState === "delivery" ? (
        <section className="rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-6">
          <h2 className="text-lg font-semibold">3. Delivery address</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="addressLine1">Street address</Label>
              <Input id="addressLine1" name="addressLine1" autoComplete="address-line1" aria-invalid={Boolean(errors.addressLine1)} />
              <FieldError>{errors.addressLine1}</FieldError>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="addressLine2">Apartment, floor, landmark (optional)</Label>
              <Input id="addressLine2" name="addressLine2" autoComplete="address-line2" />
            </div>
            {zones.length ? (
              <div className="space-y-1.5">
                <Label htmlFor="deliveryZoneId">Delivery area</Label>
                <Select id="deliveryZoneId" name="deliveryZoneId" defaultValue={zones[0]?.id ?? ""}>
                  {zones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.name} · {money(zone.deliveryFee)}
                    </option>
                  ))}
                </Select>
                <FieldHint>We match your address to a zone automatically; pick one if you know it.</FieldHint>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="area">Area</Label>
              <Input id="area" name="area" placeholder="Gulberg III" aria-invalid={Boolean(errors.area)} />
              <FieldError>{errors.area}</FieldError>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="city">City</Label>
              <Input id="city" name="city" defaultValue="Lahore" autoComplete="address-level2" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="postalCode">Postal code (optional)</Label>
              <Input id="postalCode" name="postalCode" autoComplete="postal-code" />
            </div>
          </div>
        </section>
      ) : null}

      {orderTypeState === "dine_in" ? (
        <section className="rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-6">
          <h2 className="text-lg font-semibold">3. Your table</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tableNumber">Table number</Label>
              <Input id="tableNumber" name="tableNumber" placeholder="12" aria-invalid={Boolean(errors.tableNumber)} />
              <FieldError>{errors.tableNumber}</FieldError>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="guests">Guests</Label>
              <Input id="guests" name="guests" type="number" min={1} max={60} defaultValue={2} />
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-6">
        <h2 className="text-lg font-semibold">4. Payment</h2>
        <div className="mt-4 space-y-2">
          {paymentMethods.map((method) => (
            <label
              key={method}
              className={
                paymentMethod === method
                  ? "flex cursor-pointer items-center gap-3 rounded-[var(--radius-brand)] border border-[var(--color-brand)] bg-[color-mix(in_srgb,var(--color-brand)_6%,transparent)] p-3.5"
                  : "flex cursor-pointer items-center gap-3 rounded-[var(--radius-brand)] border border-[var(--color-hairline)] p-3.5"
              }
            >
              <input
                type="radio"
                name="paymentMethod"
                value={method}
                checked={paymentMethod === method}
                onChange={() => setPaymentMethod(method)}
                className="size-4 accent-[var(--color-brand)]"
              />
              <span className="text-sm">{PAYMENT_METHOD_LABELS[method]}</span>
            </label>
          ))}
        </div>

        {showOnlineNotice ? (
          <p className="mt-3 rounded-[var(--radius-brand)] bg-amber-500/10 p-3 text-xs text-amber-800">
            Card payments are handled by the restaurant&apos;s payment provider at the confirmation step. We never store
            card details.
          </p>
        ) : (
          <FieldHint>Pay the driver or the counter when your order arrives.</FieldHint>
        )}

        <div className="mt-6 space-y-3">
          <Label htmlFor="tip">Tip the kitchen (optional)</Label>
          <div className="flex flex-wrap gap-2">
            {tipOptions.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setTip(value === 0 ? "" : String(value))}
                className={
                  (value === 0 && !tip) || tip === String(value)
                    ? "rounded-full border border-[var(--color-brand)] bg-[var(--color-brand)] px-3.5 py-1.5 text-sm text-[var(--color-brand-foreground)]"
                    : "rounded-full border border-[var(--color-hairline)] px-3.5 py-1.5 text-sm hover:border-[var(--color-brand)]"
                }
              >
                {value === 0 ? "No tip" : money(String(value))}
              </button>
            ))}
          </div>
          <Input
            id="tip"
            name="tip"
            inputMode="decimal"
            placeholder="Custom amount"
            value={tip}
            onChange={(event) => setTip(event.target.value.replace(/[^\d.]/g, ""))}
            aria-invalid={Boolean(errors.tip)}
          />
          <FieldError>{errors.tip}</FieldError>
        </div>

        <div className="mt-6 space-y-1.5">
          <Label htmlFor="notes">Order notes (optional)</Label>
          <Textarea id="notes" name="notes" rows={3} maxLength={500} placeholder="Gate code, allergies, cutlery…" />
        </div>
      </section>

      <section className="rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-6">
        <h2 className="text-lg font-semibold">Order summary</h2>
        <dl className="mt-4 space-y-2.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-[var(--color-muted-ink)]">Subtotal</dt>
            <dd>{money(pricing.subtotal)}</dd>
          </div>
          {Number(pricing.discount) > 0 ? (
            <div className="flex justify-between text-emerald-700">
              <dt>Discount{couponCode ? ` (${couponCode})` : ""}</dt>
              <dd>− {money(pricing.discount)}</dd>
            </div>
          ) : null}
          {orderTypeState === "delivery" ? (
            <div className="flex justify-between">
              <dt className="text-[var(--color-muted-ink)]">Delivery</dt>
              <dd>{Number(pricing.deliveryFee) === 0 ? "Free" : money(pricing.deliveryFee)}</dd>
            </div>
          ) : null}
          {Number(pricing.serviceFee) > 0 ? (
            <div className="flex justify-between">
              <dt className="text-[var(--color-muted-ink)]">Service fee</dt>
              <dd>{money(pricing.serviceFee)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between">
            <dt className="text-[var(--color-muted-ink)]">{pricing.taxLabel}</dt>
            <dd>{money(pricing.tax)}</dd>
          </div>
          {tip ? (
            <div className="flex justify-between">
              <dt className="text-[var(--color-muted-ink)]">Tip</dt>
              <dd>{money(tip)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between border-t border-[var(--color-hairline)] pt-3 text-base font-semibold">
            <dt>Total due</dt>
            <dd>{money(pricing.total)}</dd>
          </div>
        </dl>
        {couponCode ? (
          <p className="mt-3">
            <Badge variant="soft">{couponCode} applied</Badge>
          </p>
        ) : null}

        <Button type="submit" size="lg" data-testid="place-order" className="mt-6 w-full" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Lock aria-hidden />}
          {pending ? "Placing your order…" : `Place order · ${money(pricing.total)}`}
        </Button>
        <p className="mt-2 text-center text-xs text-[var(--color-muted-ink)]">
          Your order will be received right away. You will get a confirmation message once the restaurant confirms it.
        </p>
      </section>
    </form>
  );
}
