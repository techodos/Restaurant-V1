"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight, Banknote, Bike, Check, ChevronDown, ChevronRight, Clock, CreditCard, Landmark, Loader2, Lock, Mail, MapPin,
  Plus, ShieldCheck, ShoppingBag, Store, User, UtensilsCrossed, Wallet, type LucideIcon,
} from "lucide-react";
import { isValidPhoneNumber, type CountryCode } from "libphonenumber-js";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { FieldError, FieldHint, Input, inputStyles, Label, Select, Textarea } from "@/components/ui/input";
import { placeOrderAction } from "@/app/r/[restaurantSlug]/(site)/checkout/actions";
import { ensureVerificationCodeAction } from "@/app/r/[restaurantSlug]/(site)/account/actions";
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_ORDER_TYPES, type OrderType, type PaymentMethod } from "@/shared/contract/enums";
import { formatMoney, sumMoney } from "@/shared/money";
import type { CustomerAddress, DeliveryZone, RestaurantLocation } from "@/shared/contract/models";
import { cn } from "@/shared/utils";
import { PhoneInput } from "@/components/storefront/phone-input";
import { VerifyEmailForm } from "@/components/storefront/verify-email-form";
import { useLocalCart } from "@/components/storefront/local-cart";
import { LocationPicker, type ResolvedLocation } from "@/components/storefront/location-picker";
import { sortByDistance } from "@/shared/geo";
import type { DeliveryDestination } from "@/shared/branching";
import { useBranching } from "@/components/storefront/branching";
import { signInHref } from "@/shared/return-to";

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

/** One readable row in the order-summary ticket — a trimmed-down `TrayLineView`, display only. */
export interface CheckoutSummaryItem {
  name: string;
  /** resolved menu photo (`resolveMenuImage`), null = placeholder */
  imageUrl: string | null;
  quantity: number;
  variantName: string | null;
  addonNames: string[];
  lineTotal: string;
}

/**
 * Navigates the browser to a gateway's hosted page via a real POST, the way JazzCash's Hosted
 * Checkout Page (and most redirect-based wallet/card gateways) require — a `fetch`/GET redirect
 * cannot carry these fields. The form is submitted and left in the DOM; the page is about to
 * navigate away, so nothing needs to clean it up.
 */
/** A random UUID v4; `crypto.randomUUID` only exists on https/localhost, so a plain-http LAN test still works. */
function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

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
  /** "Restaurant closed · opens 12:00 PM" while the branch that would cook it is closed: Place order is disabled */
  closedLabel?: string | null;
  restaurantSlug: string;
  orderType: OrderType;
  orderTypeOptions: OrderType[];
  items: CheckoutSummaryItem[];
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
  /** active branches; the delivery-location step recommends the nearest one within the customer's city */
  locations: RestaurantLocation[];
  /** the cart's current branch (null on a fresh cart, defaults to the primary location server-side) */
  initialLocationId: string | null;
  /** server-resolved Google Maps browser key; the map/search picker hides itself when this is null */
  googleMapsApiKey: string | null;
  /**
   * Multi-branch ordering (`features.BranchingFeature`): the branch was chosen on the menu and is fixed
   * here — no branch cards, no re-ranking by city — and the destination chosen there prefills the address.
   * Absent with the feature off: the branch step below works exactly as before.
   */
  branch?: { name: string; menuHref: string; destination: DeliveryDestination | null } | null;
}

/** Checkout look. Every colour, radius and shadow is a theme token (`web/theme.ts`), never a fixed palette. */
const card = "rounded-[var(--radius-card)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-5 sm:p-7";
const choice =
  "relative flex cursor-pointer rounded-[var(--radius-card)] border text-left transition-[border-color,background-color,box-shadow,color,transform] duration-200 motion-reduce:transition-none has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-brand)]";
const choiceOn = "border-[var(--color-brand)] bg-[color-mix(in_srgb,var(--color-brand)_5%,var(--color-surface))] shadow-[0_0_0_1px_var(--color-brand)]";
const choiceOff = "border-[var(--color-hairline)] bg-[var(--color-surface)] hover:border-[color-mix(in_srgb,var(--color-brand)_45%,var(--color-hairline))]";
const field = "h-12";
const ctaButton =
  "group flex h-14 w-full items-center justify-between gap-3 rounded-[var(--radius-control)] bg-[var(--color-brand)] px-5 text-[15px] font-semibold text-[var(--color-brand-foreground)] transition-[background-color,transform,box-shadow] duration-200 hover:bg-[color-mix(in_srgb,var(--color-brand)_86%,black)] hover:shadow-[var(--shadow-brand)] active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand)] motion-reduce:transition-none motion-reduce:active:scale-100";

const ORDER_TYPE_COPY: Record<OrderType, { title: string; text: string; icon: LucideIcon }> = {
  delivery: { title: "Delivery", text: "Get it at your doorstep", icon: Bike },
  pickup: { title: "Pickup", text: "Collect from restaurant", icon: ShoppingBag },
  dine_in: { title: "Dine-in", text: "Served at your table", icon: UtensilsCrossed },
};

/** Only claims that hold for each method (card_online / wallet go to the restaurant's configured provider's hosted page). */
const PAYMENT_COPY: Record<PaymentMethod, { text: string; icon: LucideIcon }> = {
  cash_on_delivery: { text: "Pay when your order arrives", icon: Banknote },
  cash: { text: "Pay at the restaurant", icon: Banknote },
  card_online: { text: "Pay on the provider's secure page", icon: CreditCard },
  card_terminal: { text: "Pay by card at the counter", icon: CreditCard },
  wallet: { text: "Pay from your mobile wallet", icon: Wallet },
  bank_transfer: { text: "Pay directly from your bank account", icon: Landmark },
};

function StepHeader({ index, title, subtitle }: { index: number; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-4">
      <span
        aria-hidden
        className="tabular grid size-11 shrink-0 place-items-center rounded-full border border-[var(--rule-strong)] bg-[var(--brand-tint)] font-[family-name:var(--font-display)] text-[15px] text-[var(--color-brand)]"
      >
        {String(index).padStart(2, "0")}
      </span>
      <div className="min-w-0 pt-0.5">
        <h2 className="font-[family-name:var(--font-display)] text-[1.35rem] font-normal leading-tight text-[var(--color-ink)] sm:text-[1.55rem]">
          {title}
        </h2>
        <p className="mt-1 text-sm text-[var(--color-muted-ink)]">{subtitle}</p>
      </div>
    </div>
  );
}

/** The visible radio dot; the real input is visually hidden inside the same label. */
function RadioDot({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-full border-[1.5px] transition-colors duration-200 motion-reduce:transition-none",
        on ? "border-[var(--color-brand)] bg-[var(--color-brand)]" : "border-[var(--rule-strong)] bg-[var(--color-surface)]",
      )}
    >
      {on ? <Check className="size-3 text-[var(--color-brand-foreground)]" strokeWidth={3} /> : null}
    </span>
  );
}

/**
 * Checkout form. Field-level validation happens here for fast feedback; the
 * authoritative validation, pricing and coupon checks all run inside the server
 * action (createOrder) before anything is written.
 */
export function CheckoutForm({
  closedLabel = null,
  restaurantSlug,
  orderType,
  orderTypeOptions,
  items,
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
  locations,
  initialLocationId,
  googleMapsApiKey,
  branch = null,
}: CheckoutFormProps) {
  const branchLocked = Boolean(branch);
  const destination = branch?.destination ?? null;
  // Multi-branch: the delivery location was chosen on the menu and decided the branch, so here it is a
  // read-only card ("Change" reopens the same location sheet, which re-ranks the branches). Only the
  // details a rider needs are asked. Editing area/city here could only produce an address this branch
  // cannot serve (refused by createOrder) — so it is not offered.
  const locationLocked = branchLocked && destination !== null;
  const branching = useBranching();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();
  // state updates are async; this closes the window in which a fast double-click could submit twice
  const submitting = useRef(false);
  // one key for this checkout: a retry after "We could not confirm your order" (or any repeat) gets the same
  // order back from the server instead of a second one
  const [idempotencyKey] = useState(newIdempotencyKey);
  const [orderTypeState, setOrderTypeState] = useState<OrderType>(orderType);
  // The server already filters `paymentMethods` for the cart's order type at load ("cash on
  // delivery" for pickup/dine-in makes no sense) — this re-filters client-side too, because
  // switching order type on this page (below) doesn't re-render from the server.
  const availablePaymentMethods = useMemo(
    () => paymentMethods.filter((method) => PAYMENT_METHOD_ORDER_TYPES[method].includes(orderTypeState)),
    [paymentMethods, orderTypeState],
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(availablePaymentMethods[0] ?? "cash");
  useEffect(() => {
    if (!availablePaymentMethods.includes(paymentMethod)) {
      setPaymentMethod(availablePaymentMethods[0] ?? "cash");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availablePaymentMethods]);
  const [tip, setTip] = useState("");
  const [customTip, setCustomTip] = useState(false);
  const customTipInput = useRef<HTMLInputElement>(null);
  const [needsVerification, setNeedsVerification] = useState(isSignedIn && !emailVerified);
  const [phone, setPhone] = useState(savedPhone ?? "");
  // a saved address is the default when there is one; "new" shows the address fields
  const [addressChoice, setAddressChoice] = useState<string>(() => {
    // the address the branch was chosen for (menu) wins: a saved one by id, else it fills "new address"
    if (destination) return savedAddresses.find((address) => address.id === destination.addressId)?.id ?? "new";
    return savedAddresses.find((address) => address.isDefault)?.id ?? savedAddresses[0]?.id ?? "new";
  });
  const chosenAddress = savedAddresses.find((address) => address.id === addressChoice) ?? null;
  // "Change" on the locked card picks a new destination; the page re-renders with it — follow it, never
  // keep the previous address (it would be another place, possibly another branch's)
  const destinationKey = destination ? `${destination.addressId ?? ""}|${destination.label}|${destination.line1}` : "";
  const lastDestination = useRef(destinationKey);
  useEffect(() => {
    if (!locationLocked || lastDestination.current === destinationKey) return;
    lastDestination.current = destinationKey;
    setAddressChoice(savedAddresses.find((address) => address.id === destination!.addressId)?.id ?? "new");
    setNewAddress((current) => ({ ...current, addressLine1: destination!.line1, addressLine2: "" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinationKey]);
  const router = useRouter();
  const { clear: clearLocalCart, setLocationId } = useLocalCart();

  // "new address" fields are controlled so the map/search picker can fill them in; still hand-editable.
  const [newAddress, setNewAddress] = useState({
    addressLine1: destination?.line1 ?? "",
    addressLine2: "",
    area: destination?.area ?? "",
    city: destination?.city || defaultCity,
    postalCode: destination?.postalCode ?? "",
  });
  // "Save this address for next time" (new delivery address, signed in): saved after the order commits
  const [saveForLater, setSaveForLater] = useState(false);
  const [saveLabel, setSaveLabel] = useState(savedAddresses.length === 0 ? "Home" : "Other");
  const [pickedPoint, setPickedPoint] = useState<{ latitude: number; longitude: number } | null>(
    destination?.latitude != null && destination.longitude != null ? { latitude: destination.latitude, longitude: destination.longitude } : null,
  );
  const handlePickedLocation = (resolved: ResolvedLocation) => {
    setNewAddress((current) => ({
      ...current,
      addressLine1: resolved.addressLine1 || current.addressLine1,
      area: resolved.area || current.area,
      city: resolved.city || current.city,
      postalCode: resolved.postalCode || current.postalCode,
    }));
    setPickedPoint({ latitude: resolved.latitude, longitude: resolved.longitude });
  };

  const customerPoint = chosenAddress?.latitude && chosenAddress?.longitude
    ? { latitude: chosenAddress.latitude, longitude: chosenAddress.longitude }
    : pickedPoint;
  const customerCity = (chosenAddress ? chosenAddress.city : newAddress.city) ?? "";

  const activeLocations = locations.filter((location) => location.isActive);
  const cityMatches = customerCity.trim()
    ? activeLocations.filter((location) => (location.city ?? "").trim().toLowerCase() === customerCity.trim().toLowerCase())
    : activeLocations;
  const rankedBranches = customerPoint ? sortByDistance(cityMatches, customerPoint) : cityMatches.map((location) => ({ ...location, distanceKm: null as number | null }));
  const recommendedId = customerPoint && rankedBranches.length ? rankedBranches[0]!.id : null;

  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(initialLocationId);
  const syncedLocationRef = useRef<string | null>(initialLocationId);
  const [, startBranchSync] = useTransition();

  // Recommend/auto-select the nearest branch in the detected city whenever the address (and so the
  // ranking) changes; the customer can still tap another card in the same city to override it.
  const rankedIds = rankedBranches.map((location) => location.id).join(",");
  useEffect(() => {
    if (branchLocked || !rankedBranches.length) return;
    const stillValid = rankedBranches.some((location) => location.id === selectedLocationId);
    if (!stillValid) setSelectedLocationId(recommendedId ?? rankedBranches[0]!.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rankedIds, recommendedId]);

  // Persists the chosen branch on the tray cookie (so delivery-zone matching and the order use it; there
  // is no database cart), then refreshes the page to re-price with that branch's delivery zones.
  useEffect(() => {
    if (!selectedLocationId || selectedLocationId === syncedLocationRef.current) return;
    syncedLocationRef.current = selectedLocationId;
    startBranchSync(() => {
      setLocationId(selectedLocationId); // writes the cookie synchronously (local-cart.tsx#commit)
      router.refresh();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocationId]);

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

  // The page prices without a tip and the order adds it untaxed (domain/pricing.ts), so the amount on the
  // button is what is actually charged only once the tip is added here.
  const tipValid = /^\d+(\.\d{1,2})?$/.test(tip);
  const totalDue = tipValid ? sumMoney([pricing.total, tip]).toFixed(2) : pricing.total;
  const onlinePayment = paymentMethod === "card_online" || paymentMethod === "wallet";
  const lockedBranchCard = branch ? (
    <Link
      href={branch.menuHref}
      className="group flex items-center gap-3.5 rounded-[var(--radius-card)] border border-[var(--color-hairline)] bg-[var(--color-surface)] px-4 py-3.5 transition-[border-color] duration-200 hover:border-[color-mix(in_srgb,var(--color-brand)_45%,var(--color-hairline))] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand)] motion-reduce:transition-none"
    >
      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-brand)] bg-[var(--brand-tint)] text-[var(--color-brand)]">
        <Store className="size-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{branch.name}</span>
        <span className="block text-[13px] text-[var(--color-muted-ink)]">
          {orderTypeState === "delivery" ? "Prepares and delivers this order" : "Prepares this order"}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-[13px] font-medium text-[var(--color-brand)]">
        Change<span className="sr-only"> branch</span>
        <ChevronRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
      </span>
    </Link>
  ) : null;
  const addressSection = orderTypeState !== "pickup" || Boolean(branch);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (closedLabel) return; // the kitchen is closed (createOrder refuses it too)
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
            ...(chosenAddress.latitude && chosenAddress.longitude
              ? { latitude: chosenAddress.latitude, longitude: chosenAddress.longitude }
              : {}),
          }
        : locationLocked
          ? {
              addressLine1: newAddress.addressLine1,
              addressLine2: newAddress.addressLine2,
              area: destination!.area,
              city: destination!.city,
              postalCode: destination!.postalCode,
              ...(destination!.latitude != null && destination!.longitude != null
                ? { latitude: destination!.latitude, longitude: destination!.longitude }
                : {}),
            }
          : {
              addressLine1: newAddress.addressLine1,
              addressLine2: newAddress.addressLine2,
              area: newAddress.area,
              city: newAddress.city,
              postalCode: newAddress.postalCode,
              ...(pickedPoint ? { latitude: pickedPoint.latitude, longitude: pickedPoint.longitude } : {}),
            }),
      deliveryZoneId: value("deliveryZoneId"),
      tableNumber: value("tableNumber"),
      guests: value("guests") ? Number(value("guests")) : undefined,
      paymentMethod,
      couponCode: couponCode ?? "",
      tipAmount: tip,
      notes: value("notes"),
      saveAddressAs:
        isSignedIn && orderTypeState === "delivery" && !chosenAddress && saveForLater ? saveLabel.trim() || "Home" : "",
      idempotencyKey,
    };

    const nextErrors: Record<string, string> = {};
    if (payload.fullName.length < 2) nextErrors.fullName = "Please enter your name.";
    if (!payload.phone) nextErrors.phone = "Please enter your mobile number.";
    else if (!isValidPhoneNumber(payload.phone)) nextErrors.phone = "That mobile number does not look right for the selected country.";
    if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) nextErrors.email = "That email looks incomplete.";
    if (orderTypeState === "delivery") {
      if (!payload.addressLine1) nextErrors.addressLine1 = locationLocked ? "Add your house / flat number and street." : "Where should we deliver?";
      // the city decides which branch can deliver (the order re-checks it): ask before sending
      if (!locationLocked && !payload.city.trim()) nextErrors.city = "Please add the city.";
      if (!locationLocked && !payload.area) {
        nextErrors.area = chosenAddress
          ? "This saved address has no area. Edit it in your profile or use a new address."
          : "Please add your area so we can match a delivery zone.";
      }
      if (branchLocked) {
        // the branch is fixed; whether it delivers to this address is the order's own zone check
      } else if (activeLocations.length > 1 && payload.city && rankedBranches.length === 0) {
        nextErrors.city = `We don't have a branch in ${payload.city} yet.`;
      } else if (activeLocations.length > 1 && !selectedLocationId) {
        nextErrors.city = "Please choose a branch for delivery.";
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
            toast.error(result.error.message, { description: "Your cart is kept." });
            router.push(signInHref(restaurantSlug, `/r/${restaurantSlug}/checkout`));
            return;
          }
          toast.error(result.error.message, { description: "Nothing has been charged." });
          return;
        }
        // The order is committed in the database either way from here — the browser-held tray (already
        // written to the real cart at the start of checkout) has done its job.
        clearLocalCart();

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
          description: "Check your connection, then try again. Trying again will not place a second order.",
        });
      }
    });
  }

  if (needsVerification) {
    return (
      <section className={cn(card, "max-w-md")} aria-labelledby="verify-title">
        <h2 id="verify-title" className="font-[family-name:var(--font-display)] text-[1.35rem] font-normal leading-tight">
          Verify your email to continue
        </h2>
        <p className="mb-5 mt-2 text-sm text-[var(--color-muted-ink)]">
          We sent a 6-digit code to your email. Enter it below, then place your order.
        </p>
        <VerifyEmailForm restaurantSlug={restaurantSlug} onVerified={() => setNeedsVerification(false)} />
      </section>
    );
  }

  const orderTypeNames = orderTypeOptions.map((type) => ORDER_TYPE_COPY[type].title.toLowerCase());
  const orderTypeSubtitle =
    orderTypeNames.length > 1
      ? `Choose between ${orderTypeNames.slice(0, -1).join(", ")} or ${orderTypeNames[orderTypeNames.length - 1]}`
      : "Available for this order";
  const showBranchPicker = !branch && activeLocations.length > 1 && Boolean(customerCity.trim());
  const selectedBranch = rankedBranches.find((location) => location.id === selectedLocationId) ?? null;
  const tipPill =
    "tabular h-11 min-w-[5.5rem] rounded-[var(--radius-brand)] border px-4 text-sm transition-[background-color,border-color,color,transform] duration-200 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand)] motion-reduce:transition-none motion-reduce:active:scale-100";
  const tipOn = "border-[var(--color-brand)] bg-[var(--color-brand)] font-semibold text-[var(--color-brand-foreground)]";
  const tipOff = "border-[var(--color-hairline)] bg-[var(--color-surface)] font-medium hover:border-[color-mix(in_srgb,var(--color-brand)_45%,var(--color-hairline))]";
  const placeOrderContent = closedLabel ? (
    // closed: just the reason (no total or arrow on a button that cannot be pressed)
    <span className="flex w-full items-center justify-center gap-2.5">
      <Clock className="size-[18px]" aria-hidden />
      {closedLabel}
    </span>
  ) : (
    <>
      <span className="flex items-center gap-2.5">
        {pending ? (
          <Loader2 className="size-[18px] animate-spin" aria-hidden />
        ) : (
          <Lock className="size-[18px] text-[var(--color-brand-foreground)]" aria-hidden />
        )}
        {pending ? "Placing your order" : "Place order"}
      </span>
      <span className="tabular flex items-center gap-2">
        {money(totalDue)}
        <ArrowRight
          className="size-[18px] text-[var(--color-brand-foreground)] transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none"
          aria-hidden
        />
      </span>
    </>
  );

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="grid grid-cols-[minmax(0,1fr)] gap-6 pb-28 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] lg:gap-10 lg:pb-0 xl:gap-12"
    >
      <div className="space-y-6">
        <section className={card}>
          <StepHeader index={1} title="How would you like your order?" subtitle={orderTypeSubtitle} />
          <fieldset className="mt-6">
            <legend className="sr-only">Order type</legend>
            <div className={cn("grid gap-3", orderTypeOptions.length > 2 ? "sm:grid-cols-3" : "sm:grid-cols-2")}>
              {orderTypeOptions.map((type) => {
                const on = orderTypeState === type;
                const { title, text, icon: Icon } = ORDER_TYPE_COPY[type];
                return (
                  <label
                    key={type}
                    className={cn(
                      choice,
                      // three options share the row: stack icon over text so the copy keeps its width
                      orderTypeOptions.length > 2 ? "items-center gap-4 px-4 py-4 sm:flex-col sm:items-start sm:gap-3 sm:p-5" : "items-center gap-4 px-4 py-4 sm:px-5 sm:py-5",
                      on
                        ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-[var(--color-brand-foreground)]"
                        : choiceOff,
                    )}
                  >
                    <input
                      type="radio"
                      name="orderType"
                      value={type}
                      checked={on}
                      onChange={() => setOrderTypeState(type)}
                      className="sr-only"
                    />
                    <span
                      aria-hidden
                      className={cn(
                        "grid size-11 shrink-0 place-items-center rounded-[var(--radius-brand)] transition-colors duration-200 motion-reduce:transition-none",
                        on ? "bg-[color-mix(in_srgb,var(--color-brand-foreground)_16%,transparent)] text-[var(--color-brand-foreground)]" : "bg-[var(--brand-tint)] text-[var(--color-brand)]",
                      )}
                    >
                      <Icon className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-semibold uppercase tracking-[0.12em]">{title}</span>
                      <span className={cn("mt-0.5 block text-[13.5px]", on ? "text-[color-mix(in_srgb,var(--color-brand-foreground)_80%,transparent)]" : "text-[var(--color-muted-ink)]")}>{text}</span>
                    </span>
                    <span
                      aria-hidden
                      className={cn(
                        "grid size-6 shrink-0 place-items-center rounded-full border-[1.5px]",
                        orderTypeOptions.length > 2 && "sm:absolute sm:right-4 sm:top-4",
                        on ? "border-[var(--color-brand-accent)] bg-[var(--color-brand-accent)] text-[var(--color-brand-accent-foreground)]" : "border-[var(--rule-strong)] bg-[var(--color-surface)]",
                      )}
                    >
                      {on ? <Check className="size-3.5" strokeWidth={3} /> : null}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </section>

        <section className={card}>
          <StepHeader
            index={2}
            title="Your details"
            subtitle={orderTypeState === "delivery" ? "We'll use this information to deliver your order." : "We'll use this information to keep you updated about your order."}
          />
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">Full name</Label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted-ink)]" aria-hidden />
                <Input
                  id="fullName"
                  name="fullName"
                  defaultValue={customerDefaults?.fullName ?? ""}
                  autoComplete="name"
                  aria-invalid={Boolean(errors.fullName)}
                  required
                  className={cn(field, "pl-10")}
                />
              </div>
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
                className="[&_button]:h-12 [&_input]:h-12"
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
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted-ink)]" aria-hidden />
                {accountEmail ? (
                  <>
                    <Input
                      id="email"
                      type="email"
                      value={accountEmail}
                      readOnly
                      aria-readonly
                      aria-describedby="email-hint"
                      className={cn(field, "bg-[var(--tint)] pl-10 pr-10 text-[var(--color-muted-ink)]")}
                    />
                    <Lock className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted-ink)]" aria-hidden />
                  </>
                ) : (
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    defaultValue={customerDefaults?.email ?? ""}
                    autoComplete="email"
                    aria-invalid={Boolean(errors.email)}
                    className={cn(field, "pl-10")}
                  />
                )}
              </div>
              {accountEmail ? (
                <p id="email-hint" className="text-xs text-[var(--color-muted-ink)]">
                  Your order updates and receipt go to this address.
                </p>
              ) : null}
              <FieldError>{errors.email}</FieldError>
            </div>
          </div>
        </section>

        {orderTypeState === "delivery" ? (
          <section className={card}>
            <StepHeader index={3} title="Delivery address" subtitle="Where should we deliver your order?" />
            {locationLocked ? (
              <div className="mt-6 flex items-start gap-4 rounded-[var(--radius-card)] border border-[var(--color-hairline)] bg-[var(--tint)] p-4 sm:p-5">
                <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--color-brand)] text-[var(--color-brand-foreground)]">
                  <MapPin className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-brand)]">Delivering to</p>
                  <p className="mt-1 break-words text-base font-semibold leading-snug">{destination!.label}</p>
                  {(() => {
                    const lines = chosenAddress
                      ? [chosenAddress.addressLine1, chosenAddress.addressLine2].filter(Boolean).join(", ")
                      : [destination!.area, destination!.city].filter(Boolean).join(", ");
                    return lines ? <p className="mt-0.5 text-[13.5px] leading-snug text-[var(--color-muted-ink)]">{lines}</p> : null;
                  })()}
                </div>
                <button
                  type="button"
                  onClick={branching.openLocation}
                  className="shrink-0 rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)] px-3.5 py-2 text-[13px] font-medium text-[var(--color-brand)] transition-colors duration-200 hover:border-[var(--color-brand)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand)] motion-reduce:transition-none"
                >
                  Change<span className="sr-only"> delivery address</span>
                </button>
              </div>
            ) : null}
            {savedAddresses.length && !locationLocked ? (
              <div role="radiogroup" aria-label="Delivery address" className="mt-6 grid gap-3 sm:grid-cols-2">
                {[
                  ...savedAddresses.map((address) => ({
                    id: address.id,
                    title: address.label,
                    lines: [address.addressLine1, address.addressLine2, address.area, address.city].filter(Boolean).join(", "),
                  })),
                  { id: "new", title: "Use a new address", lines: "Enter a different address for this order" },
                ].map((option) => {
                  const on = addressChoice === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setAddressChoice(option.id)}
                      className={cn(
                        choice,
                        "items-start gap-3 px-4 py-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-brand)] active:scale-[0.99] motion-reduce:active:scale-100",
                        on ? choiceOn : choiceOff,
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "grid size-9 shrink-0 place-items-center rounded-[var(--radius-brand)]",
                          on ? "bg-[var(--color-brand)] text-[var(--color-brand-foreground)]" : "bg-[var(--brand-tint)] text-[var(--color-brand)]",
                        )}
                      >
                        {option.id === "new" ? <Plus className="size-4" /> : <MapPin className="size-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{option.title}</span>
                        <span className="mt-0.5 block text-[13px] leading-snug text-[var(--color-muted-ink)]">{option.lines}</span>
                      </span>
                      <RadioDot on={on} />
                    </button>
                  );
                })}
              </div>
            ) : null}
            {chosenAddress && (errors.addressLine1 || errors.area || (!showBranchPicker && errors.city)) ? (
              <div className="mt-3">
                <FieldError>{errors.area ?? errors.addressLine1 ?? errors.city}</FieldError>
              </div>
            ) : null}
            {chosenAddress || locationLocked ? null : (
              <div className="mt-6">
                <LocationPicker apiKey={googleMapsApiKey} country={phoneCountry} onResolve={handlePickedLocation} />
              </div>
            )}

            <div className="mt-6 grid gap-5 sm:grid-cols-2 empty:hidden">
              {chosenAddress ? null : (
                <>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="addressLine1">{locationLocked ? "House / flat no. and street" : "Street address"}</Label>
                    <Input
                      id="addressLine1"
                      autoComplete="address-line1"
                      aria-invalid={Boolean(errors.addressLine1)}
                      value={newAddress.addressLine1}
                      onChange={(event) => setNewAddress((current) => ({ ...current, addressLine1: event.target.value }))}
                      className={field}
                    />
                    <FieldError>{errors.addressLine1}</FieldError>
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label htmlFor="addressLine2">
                      {locationLocked ? "Floor, landmark, directions for the rider (optional)" : "Apartment, floor, landmark (optional)"}
                    </Label>
                    <Input
                      id="addressLine2"
                      autoComplete="address-line2"
                      value={newAddress.addressLine2}
                      onChange={(event) => setNewAddress((current) => ({ ...current, addressLine2: event.target.value }))}
                      className={field}
                    />
                  </div>
                </>
              )}
              {zones.length && !locationLocked ? (
                <div className="space-y-1.5">
                  <Label htmlFor="deliveryZoneId">Delivery area</Label>
                  <Select id="deliveryZoneId" name="deliveryZoneId" defaultValue={zones[0]?.id ?? ""} className={field}>
                    {zones.map((zone) => (
                      <option key={zone.id} value={zone.id}>
                        {zone.name} · {money(zone.deliveryFee)}
                      </option>
                    ))}
                  </Select>
                  <FieldHint>We match your address to a zone automatically; pick one if you know it.</FieldHint>
                </div>
              ) : null}
              {chosenAddress || locationLocked ? null : (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="area">Area</Label>
                    <Input
                      id="area"
                      autoComplete="address-level3"
                      aria-invalid={Boolean(errors.area)}
                      value={newAddress.area}
                      onChange={(event) => setNewAddress((current) => ({ ...current, area: event.target.value }))}
                      className={field}
                    />
                    <FieldError>{errors.area}</FieldError>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      autoComplete="address-level2"
                      aria-invalid={!showBranchPicker && Boolean(errors.city)}
                      value={newAddress.city}
                      onChange={(event) => setNewAddress((current) => ({ ...current, city: event.target.value }))}
                      className={field}
                    />
                    {/* with the branch picker visible, branch/city errors are shown under it instead */}
                    {showBranchPicker ? null : <FieldError>{errors.city}</FieldError>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="postalCode">Postal code (optional)</Label>
                    <Input
                      id="postalCode"
                      autoComplete="postal-code"
                      value={newAddress.postalCode}
                      onChange={(event) => setNewAddress((current) => ({ ...current, postalCode: event.target.value }))}
                      className={field}
                    />
                  </div>
                </>
              )}
              {/* a new (not saved) address, locked or typed: offer to keep it */}
              {!chosenAddress && isSignedIn ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:col-span-2">
                  <label className="flex cursor-pointer items-center gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      checked={saveForLater}
                      onChange={(event) => setSaveForLater(event.target.checked)}
                      className="size-4 accent-[var(--color-brand)]"
                    />
                    Save this address for next time
                  </label>
                  {saveForLater ? (
                    <Input
                      aria-label="Name for this address"
                      value={saveLabel}
                      maxLength={40}
                      onChange={(event) => setSaveLabel(event.target.value)}
                      placeholder="Home, Work…"
                      className="h-10 w-36 rounded-[var(--radius-brand)] bg-[var(--color-surface)]"
                    />
                  ) : null}
                </div>
              ) : null}
            </div>

            {branch ? (
              <div className="mt-6 space-y-2">
                <p className="text-sm font-medium">Branch</p>
                {lockedBranchCard}
              </div>
            ) : showBranchPicker ? (
              <div className="mt-6 space-y-2">
                <Label htmlFor="branch">Branch</Label>
                {rankedBranches.length === 0 ? (
                  <p className="rounded-[var(--radius-brand)] bg-[color-mix(in_srgb,var(--color-warning)_12%,transparent)] p-3 text-sm text-[color-mix(in_srgb,var(--color-warning)_70%,var(--color-ink))]">
                    We don&apos;t have a branch in {customerCity} yet.
                  </p>
                ) : (
                  <>
                    <div className="relative">
                      <Store className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-[var(--color-brand)]" aria-hidden />
                      <select
                        id="branch"
                        value={selectedLocationId ?? ""}
                        onChange={(event) => setSelectedLocationId(event.target.value)}
                        aria-describedby={selectedBranch ? "branch-hint" : undefined}
                        aria-invalid={Boolean(errors.city)}
                        className={cn(inputStyles, field, "cursor-pointer appearance-none pl-11 pr-10 font-medium")}
                      >
                        {rankedBranches.map((location) => (
                          <option key={location.id} value={location.id}>
                            {location.name}
                            {location.distanceKm !== null ? ` · ${location.distanceKm.toFixed(1)} km away` : ""}
                            {location.id === recommendedId ? " · Recommended" : ""}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted-ink)]" aria-hidden />
                    </div>
                    {selectedBranch ? (
                      <p id="branch-hint" className="text-xs text-[var(--color-muted-ink)]">
                        {[selectedBranch.addressLine1, selectedBranch.area].filter(Boolean).join(", ") || "Prepares and delivers this order"}
                      </p>
                    ) : null}
                  </>
                )}
                <FieldError>{errors.city}</FieldError>
              </div>
            ) : null}
          </section>
        ) : null}

        {orderTypeState === "pickup" && branch ? (
          <section className={card}>
            <StepHeader index={3} title="Pickup branch" subtitle="Where you'll collect your order." />
            <div className="mt-6">{lockedBranchCard}</div>
          </section>
        ) : null}

        {orderTypeState === "dine_in" ? (
          <section className={card}>
            <StepHeader index={3} title="Your table" subtitle="Tell us where you're seated." />
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="tableNumber">Table number</Label>
                <Input id="tableNumber" name="tableNumber" placeholder="12" aria-invalid={Boolean(errors.tableNumber)} className={field} />
                <FieldError>{errors.tableNumber}</FieldError>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="guests">Guests</Label>
                <Input id="guests" name="guests" type="number" min={1} max={60} defaultValue={2} className={field} />
              </div>
            </div>
          </section>
        ) : null}

        <section className={card}>
          <StepHeader index={addressSection ? 4 : 3} title="Payment" subtitle="Choose your preferred payment method." />
          <fieldset className="mt-6">
            <legend className="sr-only">Payment method</legend>
            <div className="grid gap-3">
              {availablePaymentMethods.map((method) => {
                const on = paymentMethod === method;
                const { text, icon: Icon } = PAYMENT_COPY[method];
                return (
                  <label key={method} className={cn(choice, "items-center gap-4 px-4 py-3.5", on ? choiceOn : choiceOff)}>
                    <input
                      type="radio"
                      name="paymentMethod"
                      value={method}
                      checked={on}
                      onChange={() => setPaymentMethod(method)}
                      className="sr-only"
                    />
                    <span
                      aria-hidden
                      className={cn(
                        "grid size-10 shrink-0 place-items-center rounded-[var(--radius-brand)] transition-colors duration-200 motion-reduce:transition-none",
                        on ? "bg-[var(--color-brand)] text-[var(--color-brand-foreground)]" : "bg-[var(--brand-tint)] text-[var(--color-brand)]",
                      )}
                    >
                      <Icon className="size-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold">{PAYMENT_METHOD_LABELS[method]}</span>
                      <span className="block text-[13px] text-[var(--color-muted-ink)]">
                        {method === "cash" && orderTypeState === "pickup" ? "Pay when you collect your order" : text}
                      </span>
                    </span>
                    <RadioDot on={on} />
                  </label>
                );
              })}
            </div>
          </fieldset>

          <p className="mt-4 flex items-start gap-3 rounded-[var(--radius-card)] bg-[var(--steel-2)] p-3.5 text-[13px] leading-relaxed">
            <ShieldCheck className="mt-0.5 size-[18px] shrink-0 text-[var(--color-brand)]" aria-hidden />
            <span>
              {onlinePayment
                ? "You complete the payment on the restaurant's payment provider's secure page right after placing the order. We never store card details."
                : paymentMethod === "bank_transfer"
                  ? "Nothing is charged on this page. We never store card or bank details."
                  : `Nothing is charged now. You pay ${
                      orderTypeState === "delivery" ? "when your order arrives" : orderTypeState === "pickup" ? "when you collect your order" : "at the restaurant"
                    }.`}
            </span>
          </p>
        </section>

        <section className={card} aria-labelledby="tip-title">
          <h2 id="tip-title" className="font-[family-name:var(--font-display)] text-[1.2rem] font-normal leading-tight sm:text-[1.3rem]">
            {orderTypeState === "delivery" ? "Tip for the delivery partner" : "Tip the kitchen"}
          </h2>
          <p className="mt-1 text-sm text-[var(--color-muted-ink)]">A little extra goes a long way!</p>
          <div role="group" aria-labelledby="tip-title" className="mt-5 flex flex-wrap gap-2.5">
            {tipOptions.map((value) => {
              const on = !customTip && ((value === 0 && !tip) || tip === String(value));
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setCustomTip(false);
                    setTip(value === 0 ? "" : String(value));
                  }}
                  className={cn(tipPill, on ? tipOn : tipOff)}
                >
                  {value === 0 ? "No tip" : money(String(value))}
                </button>
              );
            })}
            <button
              type="button"
              aria-pressed={customTip}
              aria-controls={customTip ? "tip" : undefined}
              onClick={() => {
                setCustomTip(true);
                setTip("");
                requestAnimationFrame(() => customTipInput.current?.focus());
              }}
              className={cn(tipPill, customTip ? tipOn : tipOff)}
            >
              Custom amount
            </button>
          </div>
          {customTip ? (
            <div className="mt-4 max-w-xs space-y-1.5">
              <Label htmlFor="tip">Custom tip ({currencySymbol})</Label>
              <Input
                ref={customTipInput}
                id="tip"
                name="tip"
                inputMode="decimal"
                placeholder="e.g. 150"
                value={tip}
                onChange={(event) => setTip(event.target.value.replace(/[^\d.]/g, ""))}
                aria-invalid={Boolean(errors.tip)}
                className={field}
              />
            </div>
          ) : null}
          <div className="mt-2">
            <FieldError>{errors.tip}</FieldError>
          </div>
        </section>

        <section className={card}>
          <h2 className="font-[family-name:var(--font-display)] text-[1.2rem] font-normal leading-tight sm:text-[1.3rem]">
            <label htmlFor="notes">
              Order notes <span className="font-sans text-sm text-[var(--color-muted-ink)]">(optional)</span>
            </label>
          </h2>
          <p id="notes-hint" className="mt-1 text-sm text-[var(--color-muted-ink)]">
            Add special instructions for your order.
          </p>
          <Textarea
            id="notes"
            name="notes"
            rows={4}
            maxLength={500}
            aria-describedby="notes-hint"
            placeholder="e.g. Extra spicy, no onions, deliver after 6 PM..."
            className="mt-4 min-h-32 rounded-[var(--radius-brand)] bg-[var(--color-surface)]"
          />
        </section>
      </div>

      <aside className="lg:sticky lg:top-[calc(var(--header-h,4.5rem)+1.5rem)] lg:self-start">
        <section
          aria-labelledby="summary-title"
          className="overflow-hidden rounded-[var(--radius-panel)] border border-[var(--color-hairline)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]"
        >
          <div className="relative bg-[var(--color-brand)] px-6 pb-6 pt-6 text-[var(--color-brand-foreground)] sm:px-7">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="summary-title" className="font-[family-name:var(--font-display)] text-[1.55rem] font-normal leading-tight">
                Order summary
              </h2>
              <span className="tabular shrink-0 text-[12.5px] text-[color-mix(in_srgb,var(--color-brand-foreground)_75%,transparent)]">
                {items.reduce((count, item) => count + item.quantity, 0)} item
                {items.reduce((count, item) => count + item.quantity, 0) === 1 ? "" : "s"}
              </span>
            </div>
            <p className="mt-1 text-[13.5px] text-[color-mix(in_srgb,var(--color-brand-foreground)_80%,transparent)]">Your delicious meal is just a step away</p>
            <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-[var(--color-brand-accent)]" />
          </div>

          <div className="px-6 pb-6 pt-5 sm:px-7">
            <ul aria-label="Items in your order" className="-mx-1 space-y-4 px-1 py-1 lg:max-h-[min(34vh,19rem)] lg:overflow-y-auto">
              {items.map((item, index) => (
                <li key={index} className="flex items-center gap-3.5">
                  <div className="relative size-14 shrink-0 overflow-hidden rounded-[var(--radius-brand)] bg-[var(--brand-tint)]">
                    {item.imageUrl ? (
                      <Image src={item.imageUrl} alt={item.name} fill sizes="56px" className="object-cover" />
                    ) : (
                      <span className="grid size-full place-items-center text-[var(--color-brand)]">
                        <UtensilsCrossed className="size-5" aria-hidden />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] font-semibold leading-snug">{item.name}</p>
                    {item.variantName || item.addonNames.length ? (
                      <p className="mt-0.5 text-[12.5px] leading-snug text-[var(--color-muted-ink)]">
                        {[item.variantName, ...item.addonNames].filter(Boolean).join(" · ")}
                      </p>
                    ) : null}
                    <p className="tabular mt-0.5 text-[12.5px] text-[var(--color-muted-ink)]">Qty {item.quantity}</p>
                  </div>
                  <p className="tabular shrink-0 whitespace-nowrap text-[14.5px] font-medium">{money(item.lineTotal)}</p>
                </li>
              ))}
            </ul>

            <dl className="tabular mt-5 space-y-2.5 border-t border-[var(--color-hairline)] pt-5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--color-muted-ink)]">Subtotal</dt>
                <dd>{money(pricing.subtotal)}</dd>
              </div>
              {Number(pricing.discount) > 0 ? (
                <div className="flex justify-between gap-4 text-[var(--color-success)]">
                  <dt>Discount{couponCode ? ` (${couponCode})` : ""}</dt>
                  <dd>-{money(pricing.discount)}</dd>
                </div>
              ) : null}
              {orderTypeState === "delivery" ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--color-muted-ink)]">Delivery</dt>
                  <dd>{Number(pricing.deliveryFee) === 0 ? "Free" : money(pricing.deliveryFee)}</dd>
                </div>
              ) : null}
              {Number(pricing.serviceFee) > 0 ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--color-muted-ink)]">Service fee</dt>
                  <dd>{money(pricing.serviceFee)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--color-muted-ink)]">
                  {pricing.taxLabel}
                  {pricing.taxIncluded ? " (included)" : ""}
                </dt>
                <dd>{money(pricing.tax)}</dd>
              </div>
              {tip ? (
                <div className="flex justify-between gap-4">
                  <dt className="text-[var(--color-muted-ink)]">Tip</dt>
                  <dd>{tipValid ? money(tip) : "—"}</dd>
                </div>
              ) : null}
              <div className="!mt-5 flex items-center justify-between gap-4 rounded-[var(--radius-card)] bg-[var(--brand-tint)] px-4 py-4">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--color-brand)]">Total due</dt>
                <dd aria-live="polite" className="font-[family-name:var(--font-display)] text-[1.85rem] leading-none text-[var(--color-brand)]">
                  {money(totalDue)}
                </dd>
              </div>
            </dl>
            {couponCode ? (
              <p className="mt-3">
                <Badge variant="soft">{couponCode} applied</Badge>
              </p>
            ) : null}

            <button type="submit" data-testid="place-order" disabled={pending || Boolean(closedLabel)} className={cn(ctaButton, "mt-5 hidden lg:flex")}>
              {placeOrderContent}
            </button>
            <p className="mt-3 text-center text-xs leading-relaxed text-[var(--color-muted-ink)]">
              The kitchen receives your order right away. You will get a confirmation once the restaurant accepts it.
            </p>
          </div>
        </section>
      </aside>

      {/* phones: the place-order action stays under the thumb with the live total */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-hairline)] bg-[color-mix(in_srgb,var(--color-canvas)_94%,transparent)] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl lg:hidden">
        <button type="submit" disabled={pending || Boolean(closedLabel)} className={ctaButton}>
          {placeOrderContent}
        </button>
      </div>
    </form>
  );
}
