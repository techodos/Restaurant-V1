"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, MapPin, Plus } from "lucide-react";
import { isValidPhoneNumber, type CountryCode } from "libphonenumber-js";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FieldError, FieldHint, Input, Label, Select, Textarea } from "@/components/ui/input";
import { placeOrderAction } from "@/app/r/[restaurantSlug]/checkout/actions";
import { ensureVerificationCodeAction } from "@/app/r/[restaurantSlug]/account/actions";
import { PAYMENT_METHOD_LABELS, type OrderType, type PaymentMethod } from "@/shared/contract/enums";
import { formatMoney } from "@/shared/money";
import type { CustomerAddress, DeliveryZone } from "@/shared/contract/models";
import { cn } from "@/shared/utils";
import { PhoneInput } from "@/components/storefront/phone-input";
import { VerifyEmailForm } from "@/components/storefront/verify-email-form";
import { signInHref } from "@/shared/return-to";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

/**
 * Navigates the browser to a gateway's hosted page via a real POST, the way JazzCash's Hosted
 * Checkout Page (and most redirect-based wallet/card gateways) require — a `fetch`/GET redirect
 * cannot carry these fields. The form is submitted and left in the DOM; the page is about to
 * navigate away, so nothing needs to clean it up.
 */
function submitWalletForm(formAction: string, formFields: Record<string, string>): void {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = formAction;
  form.style.display = "none";
  for (const [name, value] of Object.entries(formFields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
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
  emailVerified: boolean;
  customerDefaults: { fullName: string; phone: string; email: string } | null;
  /** the restaurant's own city (primary location), prefilled for delivery */
  defaultCity: string;
  /** the signed-in account's email: shown read-only and always the one used for the order */
  accountEmail: string | null;
  /** the account's saved mobile (E.164): shown read-only; null = ask once, saved with the order */
  savedPhone: string | null;
  /** the customer's saved delivery addresses (profile) */
  savedAddresses: CustomerAddress[];
  /** country preselected in the phone picker (the restaurant's country) */
  phoneCountry: CountryCode;
}

/**
 * Checkout form. Field-level validation happens here for fast feedback; the
 * authoritative validation, pricing and coupon checks all run inside the server
 * action (createOrder) before anything is written.
 */
function StepTitle({ index, children }: { index: number; children: React.ReactNode }) {
  return (
    <h2 className="flex items-baseline gap-4">
      <span aria-hidden className="tabular font-[family-name:var(--font-display)] text-[1.7rem] leading-none text-[var(--color-brand-accent)]">
        {String(index).padStart(2, "0")}
      </span>
      <span className="display-3">{children}</span>
    </h2>
  );
}

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
  emailVerified,
  customerDefaults,
  defaultCity,
  accountEmail,
  savedPhone,
  savedAddresses,
  phoneCountry,
}: CheckoutFormProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  // state updates are async; this closes the window in which a fast double-click could submit twice
  const submitting = useRef(false);
  const [orderTypeState, setOrderTypeState] = useState<OrderType>(orderType);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(paymentMethods[0] ?? "cash");
  const [tip, setTip] = useState("");
  const [needsVerification, setNeedsVerification] = useState(isSignedIn && !emailVerified);
  const [phone, setPhone] = useState(savedPhone ?? "");
  // a saved address is the default when there is one; "new" shows the address fields
  const [addressChoice, setAddressChoice] = useState<string>(
    () => savedAddresses.find((address) => address.isDefault)?.id ?? savedAddresses[0]?.id ?? "new",
  );
  const chosenAddress = savedAddresses.find((address) => address.id === addressChoice) ?? null;
  const router = useRouter();

  useEffect(() => {
    if (needsVerification) void ensureVerificationCodeAction(restaurantSlug);
    // only on first mount of the gate: resending belongs to the form's own "Resend code" button
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      phone,
      email: accountEmail ?? value("email"),
      ...(chosenAddress
        ? {
            addressLine1: chosenAddress.addressLine1,
            addressLine2: chosenAddress.addressLine2 ?? "",
            area: chosenAddress.area ?? "",
            city: chosenAddress.city ?? "",
            postalCode: chosenAddress.postalCode ?? "",
          }
        : {
            addressLine1: value("addressLine1"),
            addressLine2: value("addressLine2"),
            area: value("area"),
            city: value("city"),
            postalCode: value("postalCode"),
          }),
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
    if (!payload.phone) nextErrors.phone = "Please enter your mobile number.";
    else if (!isValidPhoneNumber(payload.phone)) nextErrors.phone = "That mobile number does not look right for the selected country.";
    if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) nextErrors.email = "That email looks incomplete.";
    if (orderTypeState === "delivery") {
      if (!payload.addressLine1) nextErrors.addressLine1 = "Where should we deliver?";
      if (!payload.area) {
        nextErrors.area = chosenAddress
          ? "This saved address has no area. Edit it in your profile or use a new address."
          : "Please add your area so we can match a delivery zone.";
      }
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
          if (result.error.code === "EMAIL_NOT_VERIFIED") {
            setNeedsVerification(true);
            return;
          }
          if (result.error.code === "SIGN_IN_REQUIRED") {
            // the session ended mid-checkout: sign in again and come straight back here
            toast.error(result.error.message, { description: "Your tray is kept." });
            router.push(signInHref(restaurantSlug, `/r/${restaurantSlug}/checkout`));
            return;
          }
          toast.error(result.error.message, { description: "Nothing has been charged." });
          return;
        }
        // stays locked while we navigate away — either to the order page, or (an online payment)
        // on to the gateway's own hosted page first
        if (result.data.payment) {
          toast.success("Order received", { description: "Redirecting you to complete the payment…" });
          if (result.data.payment.kind === "redirect") {
            window.location.href = result.data.payment.redirectUrl; // Stripe Checkout: plain GET
          } else {
            submitWalletForm(result.data.payment.formAction, result.data.payment.formFields); // JazzCash: needs a real POST
          }
          return;
        }
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

  if (needsVerification) {
    return (
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle className="text-lg">Verify your email to continue</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-[var(--color-muted-ink)]">
            We sent a 6-digit code to your email. Enter it below, then place your order.
          </p>
          <VerifyEmailForm restaurantSlug={restaurantSlug} onVerified={() => setNeedsVerification(false)} />
        </CardContent>
      </Card>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="grid grid-cols-[minmax(0,1fr)] gap-8 pb-28 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-12 lg:pb-0"
    >
      <div className="space-y-8">
      <section className="pt-2">
        <StepTitle index={1}>How would you like your order?</StepTitle>
        <div className="mt-5 flex max-w-md rounded-full bg-[var(--steel-2)] p-1" role="group" aria-label="Order type">
          {orderTypeOptions.map((type) => (
            <button
              key={type}
              type="button"
              aria-pressed={orderTypeState === type}
              onClick={() => setOrderTypeState(type)}
              className={
                orderTypeState === type
                  ? "h-10 flex-1 rounded-full bg-[var(--color-surface)] text-sm font-semibold shadow-[0_1px_3px_color-mix(in_srgb,var(--color-ink)_14%,transparent)] transition-[background-color,box-shadow] duration-200"
                  : "h-10 flex-1 rounded-full text-sm font-medium text-[var(--color-muted-ink)] transition-colors duration-200 hover:text-[var(--color-ink)]"
              }
            >
              {type === "delivery" ? "Delivery" : type === "pickup" ? "Pickup" : "Dine-in"}
            </button>
          ))}
        </div>
      </section>

      <section className="border-t border-[var(--rule)] pt-8">
        <StepTitle index={2}>Your details</StepTitle>

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
            <Label htmlFor="phone">
              Phone number{" "}
              {savedPhone ? (
                <span className="font-normal text-[var(--color-muted-ink)]">· from your account</span>
              ) : (
                <span aria-hidden className="text-[var(--color-danger)]">*</span>
              )}
            </Label>
            <PhoneInput
              id="phone"
              value={phone}
              onChange={setPhone}
              defaultCountry={phoneCountry}
              disabled={Boolean(savedPhone)}
              required={!savedPhone}
              aria-invalid={Boolean(errors.phone) || undefined}
              aria-describedby="phone-hint"
            />
            <p id="phone-hint" className="text-xs text-[var(--color-muted-ink)]">
              {savedPhone
                ? "Saved on your account. You can change it from your profile."
                : "Required. We save it to your account with this order, so next time it is filled in for you."}
            </p>
            <FieldError>{errors.phone}</FieldError>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="email">
              Email{" "}
              {accountEmail ? <span className="font-normal text-[var(--color-muted-ink)]">· from your account</span> : null}
            </Label>
            {accountEmail ? (
              <div className="relative">
                <Input id="email" type="email" value={accountEmail} readOnly aria-readonly className="pr-10 text-[var(--color-muted-ink)]" />
                <Lock className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted-ink)]" aria-hidden />
              </div>
            ) : (
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={customerDefaults?.email ?? ""}
                autoComplete="email"
                aria-invalid={Boolean(errors.email)}
              />
            )}
            {accountEmail ? <FieldHint>Your order updates and receipt go to this address.</FieldHint> : null}
            <FieldError>{errors.email}</FieldError>
          </div>
        </div>
      </section>

      {orderTypeState === "delivery" ? (
        <section className="border-t border-[var(--rule)] pt-8">
          <StepTitle index={3}>Delivery address</StepTitle>
          {savedAddresses.length ? (
            <div role="radiogroup" aria-label="Delivery address" className="mt-5 grid gap-2 sm:grid-cols-2">
              {[...savedAddresses.map((address) => ({ id: address.id, title: address.label, lines: [address.addressLine1, address.addressLine2, address.area, address.city].filter(Boolean).join(", ") })), { id: "new", title: "Use a new address", lines: "Enter a different address for this order" }].map((option) => {
                const on = addressChoice === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setAddressChoice(option.id)}
                    className={cn(
                      "press flex items-start gap-3 rounded-[var(--radius-card)] border px-4 py-3.5 text-left transition-[border-color,box-shadow,background-color] duration-200",
                      on
                        ? "border-[var(--color-brand)] bg-[color-mix(in_srgb,var(--color-brand)_6%,var(--color-surface))] shadow-[0_0_0_1px_var(--color-brand)]"
                        : "border-[var(--color-hairline)] bg-[var(--color-surface)] hover:border-[color-mix(in_srgb,var(--color-ink)_30%,var(--color-hairline))]",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border",
                        on ? "border-[var(--color-brand)]" : "border-[var(--rule-strong)]",
                      )}
                    >
                      {on ? <span className="size-2 rounded-full bg-[var(--color-brand)]" /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-sm font-semibold">
                        {option.id === "new" ? <Plus className="size-3.5" aria-hidden /> : <MapPin className="size-3.5 text-[var(--color-brand-accent)]" aria-hidden />}
                        {option.title}
                      </span>
                      <span className="mt-0.5 block text-[13px] leading-snug text-[var(--color-muted-ink)]">{option.lines}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
          {chosenAddress && (errors.addressLine1 || errors.area) ? (
            <div className="mt-3"><FieldError>{errors.area ?? errors.addressLine1}</FieldError></div>
          ) : null}
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {chosenAddress ? null : (
            <>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="addressLine1">Street address</Label>
              <Input id="addressLine1" name="addressLine1" autoComplete="address-line1" aria-invalid={Boolean(errors.addressLine1)} />
              <FieldError>{errors.addressLine1}</FieldError>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="addressLine2">Apartment, floor, landmark (optional)</Label>
              <Input id="addressLine2" name="addressLine2" autoComplete="address-line2" />
            </div>
            </>
            )}
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
            {chosenAddress ? null : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="area">Area</Label>
                  <Input id="area" name="area" autoComplete="address-level3" aria-invalid={Boolean(errors.area)} />
                  <FieldError>{errors.area}</FieldError>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="city">City</Label>
                  <Input id="city" name="city" defaultValue={defaultCity} autoComplete="address-level2" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="postalCode">Postal code (optional)</Label>
                  <Input id="postalCode" name="postalCode" autoComplete="postal-code" />
                </div>
              </>
            )}
          </div>
        </section>
      ) : null}

      {orderTypeState === "dine_in" ? (
        <section className="border-t border-[var(--rule)] pt-8">
          <StepTitle index={3}>Your table</StepTitle>
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

      <section className="border-t border-[var(--rule)] pt-8">
        <StepTitle index={4}>Payment</StepTitle>
        <div className="mt-4 space-y-2">
          {paymentMethods.map((method) => (
            <label
              key={method}
              className={
                paymentMethod === method
                  ? "flex min-h-14 cursor-pointer items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-brand)] bg-[color-mix(in_srgb,var(--color-brand)_6%,var(--color-surface))] px-4 py-3 shadow-[0_0_0_1px_var(--color-brand)] transition-colors"
                  : "flex min-h-14 cursor-pointer items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-hairline)] bg-[var(--color-surface)] px-4 py-3 transition-colors hover:border-[color-mix(in_srgb,var(--color-ink)_30%,var(--color-hairline))]"
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
              <span className="text-sm font-medium">{PAYMENT_METHOD_LABELS[method]}</span>
            </label>
          ))}
        </div>

        {showOnlineNotice ? (
          <p className="mt-3 rounded-[var(--radius-brand)] bg-[color-mix(in_srgb,var(--color-warning)_12%,transparent)] p-3 text-xs text-[color-mix(in_srgb,var(--color-warning)_70%,var(--color-ink))]">
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
                    ? "press tabular h-10 rounded-[var(--radius-control)] border border-[var(--color-brand)] bg-[var(--color-brand)] px-4 text-sm font-semibold text-[var(--color-brand-foreground)]"
                    : "press tabular h-10 rounded-[var(--radius-control)] border border-[var(--color-hairline)] bg-[var(--color-surface)] px-4 text-sm font-medium hover:border-[color-mix(in_srgb,var(--color-ink)_35%,var(--color-hairline))]"
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

      </div>

      <aside className="lg:sticky lg:top-[calc(var(--header-h,4.5rem)+1.5rem)] lg:self-start">
      <section className="tone-night rounded-[var(--radius-panel)] p-6 shadow-[var(--shadow-raised)] md:p-8">
        <h2 className="display-3">Order summary</h2>
        <span aria-hidden className="mt-5 block h-px bg-[var(--rule)]" />
        <dl className="tabular mt-5 space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-[var(--color-muted-ink)]">Subtotal</dt>
            <dd>{money(pricing.subtotal)}</dd>
          </div>
          {Number(pricing.discount) > 0 ? (
            <div className="flex justify-between text-[var(--color-success)]">
              <dt>Discount{couponCode ? ` (${couponCode})` : ""}</dt>
              <dd>-{money(pricing.discount)}</dd>
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
          <div className="flex items-baseline justify-between border-t border-dashed border-[var(--rule-strong)] pt-4 text-lg font-semibold">
            <dt>Total due</dt>
            <dd>{money(pricing.total)}</dd>
          </div>
        </dl>
        {couponCode ? (
          <p className="mt-3">
            <Badge variant="soft">{couponCode} applied</Badge>
          </p>
        ) : null}

        <Button type="submit" size="lg" data-testid="place-order" className="mt-6 hidden h-13 w-full justify-between px-6 lg:flex" disabled={pending}>
          <span className="flex items-center gap-2">
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Lock aria-hidden />}
            {pending ? "Placing your order" : "Place order"}
          </span>
          <span className="tabular">{money(pricing.total)}</span>
        </Button>
        <p className="mt-3 text-center text-xs leading-relaxed text-[var(--color-muted-ink)]">
          The kitchen receives your order right away. You will get a confirmation once the restaurant accepts it.
        </p>
      </section>
      </aside>

      {/* phones: the place-order action stays under the thumb with the live total */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--rule)] bg-[color-mix(in_srgb,var(--color-surface)_94%,transparent)] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl lg:hidden">
        <Button type="submit" size="lg" className="h-13 w-full justify-between px-6" disabled={pending}>
          <span className="flex items-center gap-2">
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Lock aria-hidden />}
            {pending ? "Placing your order" : "Place order"}
          </span>
          <span className="tabular">{money(pricing.total)}</span>
        </Button>
      </div>
    </form>
  );
}
