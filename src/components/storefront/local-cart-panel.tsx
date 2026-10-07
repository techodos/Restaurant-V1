"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Info, Loader2, Minus, Plus, ShoppingBag, Store, Tag, X } from "lucide-react";
import { toast } from "sonner";
import { dec, formatMoney, round2, toMoney } from "@/shared/money";
import { ORDER_TYPE_LABELS, type OrderType } from "@/shared/contract/enums";
import { cn } from "@/shared/utils";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { checkCouponAction } from "@/app/r/[restaurantSlug]/(site)/cart/actions";
import { localCartItemCount, localLineTotal, useLocalCart } from "./local-cart";
import { useBranching } from "./branching";
import { EmptyState } from "./empty-state";

interface LocalCartPanelProps {
  variant: "page" | "drawer";
  restaurantSlug: string;
  restaurantName: string;
  coverUrl: string | null;
  currencySymbol: string;
  locale: string;
  featureCoupons: boolean;
  featureReservations: boolean;
  minimumOrderAmount: string;
  availableOrderTypes: OrderType[];
  isSignedIn: boolean;
  signInHref: string;
}

/**
 * The tray, shared by the full /cart page and the drawer (@modal/(.)cart). Reads the browser-held tray
 * (`local-cart.tsx`, a cookie) — there is no database cart. Shows the subtotal (and a promo preview);
 * delivery fee and tax appear on the checkout page, priced from the same cookie by the same engine the
 * order uses. Nothing here makes a request except "Apply" on a promo code (answered from memory).
 */
export function LocalCartPanel({
  variant,
  restaurantSlug,
  restaurantName,
  coverUrl,
  currencySymbol,
  locale,
  featureCoupons,
  featureReservations,
  minimumOrderAmount,
  availableOrderTypes,
  isSignedIn,
  signInHref,
}: LocalCartPanelProps) {
  const { cart, updateQuantity, removeLine, clear, setOrderType, setCoupon } = useLocalCart();
  const [couponInput, setCouponInput] = useState("");
  const [couponPending, startCouponCheck] = useTransition();
  const [checkoutPending, startCheckout] = useTransition();
  const hasProblem = cart.lines.some((line) => line.display.problem);
  const router = useRouter();
  // multi-branch ordering: the cart belongs to one branch (feature off: gate is "ok", nothing shows)
  const branching = useBranching();
  const branchGate = branching.gate();
  const drawer = variant === "drawer";
  const home = `/r/${restaurantSlug}`;
  const money = (value: string | number) => formatMoney(value, { currency: currencySymbol, locale });

  const subtotal = cart.lines.reduce((total, line) => total.plus(localLineTotal(line)), dec(0));
  const discount = cart.couponDiscount ? dec(cart.couponDiscount) : dec(0);
  const belowMinimum = dec(minimumOrderAmount).greaterThan(0) && subtotal.greaterThan(0) && subtotal.lessThan(dec(minimumOrderAmount));
  const itemCount = localCartItemCount(cart);

  function goToCheckout() {
    if (branchGate !== "ok") {
      branching.resolveGate();
      return;
    }
    if (!isSignedIn) {
      router.push(signInHref);
      return;
    }
    // Nothing to save first: the tray already is the cookie the checkout page reads.
    startCheckout(() => router.push(`${home}/checkout`));
  }

  function applyCoupon() {
    const code = couponInput.trim();
    if (!code) return;
    startCouponCheck(async () => {
      const result = await checkCouponAction(restaurantSlug, { code, orderType: cart.orderType, subtotal: toMoney(subtotal) });
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      setCoupon(result.data.code, result.data.discount);
      setCouponInput("");
      toast.success(`Promo code ${result.data.code} applied`);
    });
  }

  if (cart.lines.length === 0) {
    const empty = (
      <EmptyState
        icon={ShoppingBag}
        title="Your cart is empty"
        titleAs={drawer ? "h2" : "h1"}
        className={drawer ? "px-6 py-14" : "py-0"}
        actions={
          <>
            <Button asChild size="lg">
              <Link href={`${home}/menu`}>Browse the menu</Link>
            </Button>
            {featureReservations ? (
              <Button asChild size="lg" variant="outline">
                <Link href={`${home}/reservation`}>Book a table</Link>
              </Button>
            ) : null}
          </>
        }
      >
        Add dishes from the menu and they land here. Nothing is charged until you place the order.
      </EmptyState>
    );
    if (drawer) return empty;
    return (
      <section className="tone-night relative isolate grid min-h-[min(60svh,560px)] place-items-center overflow-hidden px-5 py-16">
        {coverUrl ? (
          <>
            <Image src={coverUrl} alt="" fill sizes="100vw" className="animate-hero -z-20 object-cover" />
            <span aria-hidden className="absolute inset-0 -z-10 bg-black/65" />
          </>
        ) : null}
        {empty}
      </section>
    );
  }

  const lines = (
    <ul className="divide-y divide-[var(--rule)]">
      {cart.lines.map((line) => {
        // already resolved server-side at add time (QuickAddButton/ItemCustomizer's caller); this is
        // a client component and cannot re-run that resolution (web/media.ts reads the filesystem)
        const image = line.display.imageUrl;
        const lineTotal = localLineTotal(line);
        return (
          <li
            key={line.id}
            className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-4 py-5 sm:grid-cols-[5.5rem_minmax(0,1fr)]"
          >
            <div className="plate">
              {image ? (
                <Image src={image} alt="" fill sizes="88px" className="object-cover" />
              ) : (
                <span className="grid h-full place-items-center font-[family-name:var(--font-display)] text-2xl text-[var(--color-muted-ink)]" aria-hidden>
                  {line.display.name.slice(0, 1)}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold">
                    {line.display.slug ? (
                      <Link href={`${home}/menu/${line.display.slug}`} scroll={false} className="hover:text-[var(--color-brand)]">
                        {line.display.name}
                      </Link>
                    ) : (
                      line.display.name
                    )}
                  </p>
                  {line.display.variantName || line.display.addonNames.length ? (
                    <p className="mt-0.5 text-[13px] leading-snug text-[var(--color-muted-ink)]">
                      {[line.display.variantName, ...line.display.addonNames.map((name) => `+ ${name}`)].filter(Boolean).join(", ")}
                    </p>
                  ) : null}
                  {line.display.problem ? (
                    <p className="mt-1 text-[13px] font-medium text-[var(--color-danger)]">
                      {line.display.problem} Remove it to check out.
                    </p>
                  ) : null}
                  {line.specialInstructions ? (
                    <p className="mt-1 text-xs italic text-[var(--color-muted-ink)]">&ldquo;{line.specialInstructions}&rdquo;</p>
                  ) : null}
                </div>
                <p className="tabular whitespace-nowrap text-[15px] font-semibold">{money(toMoney(lineTotal))}</p>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="flex h-9 items-center rounded-full border border-[var(--rule-strong)]">
                  <button
                    type="button"
                    aria-label={line.quantity === 1 ? `Remove ${line.display.name}` : `Decrease quantity of ${line.display.name}`}
                    className="press grid size-9 place-items-center"
                    onClick={() => updateQuantity(line.id, line.quantity - 1)}
                  >
                    <Minus className="size-3.5" aria-hidden />
                  </button>
                  <span aria-live="polite" className="tabular w-7 text-center text-sm font-semibold">
                    <span key={line.quantity} className="animate-tick inline-block">
                      {line.quantity}
                    </span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Increase quantity of ${line.display.name}`}
                    data-testid="cart-line-increase"
                    className="press grid size-9 place-items-center disabled:opacity-40"
                    onClick={() => updateQuantity(line.id, line.quantity + 1)}
                    disabled={line.quantity >= 99}
                  >
                    <Plus className="size-3.5" aria-hidden />
                  </button>
                </div>
                <button
                  type="button"
                  className="press inline-flex items-center gap-1 text-[13px] text-[var(--color-muted-ink)] transition-colors hover:text-[var(--color-danger)]"
                  onClick={() => removeLine(line.id)}
                >
                  <X className="size-3.5" aria-hidden />
                  Remove
                </button>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );

  const orderTypePicker =
    availableOrderTypes.length > 1 ? (
      <div className="flex rounded-full bg-[var(--steel-2)] p-1" role="group" aria-label="Order type">
        {availableOrderTypes.map((type) => (
          <button
            key={type}
            type="button"
            aria-pressed={cart.orderType === type}
            onClick={() => setOrderType(type)}
            className={cn(
              "inline-flex flex-1 items-center justify-center gap-2 rounded-full py-2 text-[13px] font-medium transition-[background-color,color,box-shadow] duration-200",
              cart.orderType === type
                ? "bg-[var(--color-surface)] text-[var(--color-ink)] shadow-[0_1px_3px_color-mix(in_srgb,var(--color-ink)_14%,transparent)]"
                : "text-[var(--color-muted-ink)] hover:text-[var(--color-ink)]",
            )}
          >
            {ORDER_TYPE_LABELS[type]}
          </button>
        ))}
      </div>
    ) : null;

  const couponForm = featureCoupons ? (
    cart.couponCode ? (
      <div className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-dashed border-[var(--rule-strong)] px-4 py-3">
        <span className="inline-flex items-center gap-2 text-sm font-medium">
          <Tag className="size-4 text-[var(--color-brand)]" aria-hidden />
          {cart.couponCode} applied
        </span>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-sm text-[var(--color-muted-ink)] hover:text-[var(--color-danger)]"
          onClick={() => setCoupon(null, null)}
        >
          <X className="size-3.5" aria-hidden />
          Remove
        </button>
      </div>
    ) : (
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          applyCoupon();
        }}
      >
        <Label htmlFor="promo-code">Promo code</Label>
        <div className="flex gap-2">
          <Input
            id="promo-code"
            name="code"
            value={couponInput}
            onChange={(event) => setCouponInput(event.target.value.toUpperCase())}
            placeholder="Enter code"
            autoComplete="off"
            className="uppercase"
          />
          <Button type="submit" variant="outline" className="rounded-full" disabled={couponPending || !couponInput.trim()}>
            {couponPending ? <Loader2 className="animate-spin" aria-hidden /> : "Apply"}
          </Button>
        </div>
        <Button type="button" variant="link" size="sm" className="text-xs text-[var(--color-muted-ink)]" onClick={clear}>
          Empty cart
        </Button>
      </form>
    )
  ) : null;

  const receipt = (
    <dl className="tabular space-y-2.5 text-sm">
      <div data-testid="cart-subtotal" className="flex justify-between">
        <dt className="text-[var(--color-muted-ink)]">Subtotal</dt>
        <dd>{money(toMoney(subtotal))}</dd>
      </div>
      {discount.greaterThan(0) ? (
        <div className="flex justify-between text-[var(--color-success)]">
          <dt>Discount{cart.couponCode ? ` (${cart.couponCode})` : ""}</dt>
          <dd>-{money(toMoney(discount))}</dd>
        </div>
      ) : null}
      <p className="text-xs text-[var(--color-muted-ink)]">Delivery fee, tax and the final total are confirmed at checkout.</p>
    </dl>
  );

  const notices = (
    <>
      {branching.enabled && branching.selected ? (
        <p className="flex items-center gap-2 rounded-[var(--radius-card)] bg-[var(--steel-2)] p-3.5 text-sm">
          <Store className="size-4 shrink-0 text-[var(--color-muted-ink)]" aria-hidden />
          <span className="min-w-0 flex-1 truncate">
            <span className="text-[var(--color-muted-ink)]">Ordering from </span>
            <span className="font-semibold">{branching.selected.name}</span>
          </span>
          {branching.branches.length > 1 ? (
            <button type="button" onClick={branching.openBranches} className="shrink-0 text-[13px] font-medium underline underline-offset-4">
              Change
            </button>
          ) : null}
        </p>
      ) : null}
      {branchGate !== "ok" ? (
        <p className="flex gap-2 rounded-[var(--radius-card)] bg-[color-mix(in_srgb,var(--color-warning)_12%,transparent)] p-3.5 text-sm text-[color-mix(in_srgb,var(--color-warning)_70%,var(--color-ink))]">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {branchGate === "no-service"
              ? `We don't deliver to ${branching.destination?.label ?? "that location"} yet. `
              : branchGate === "need-location"
                ? "Choose your delivery location to continue. "
                : "Choose a branch to continue. "}
            <button type="button" onClick={() => (branchGate === "need-branch" ? branching.openBranches() : branching.openLocation())} className="font-semibold underline underline-offset-4">
              {branchGate === "need-branch" ? "Choose branch" : branchGate === "no-service" ? "Change location" : "Choose location"}
            </button>
          </span>
        </p>
      ) : null}
      {!isSignedIn ? (
        <p className="flex gap-2 rounded-[var(--radius-card)] bg-[var(--steel-2)] p-3.5 text-sm text-[var(--color-muted-ink)]">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          Orders are placed from an account with a verified email. Your cart is kept while you sign in.
        </p>
      ) : null}
      {belowMinimum ? (
        <p className="flex gap-2 rounded-[var(--radius-card)] bg-[color-mix(in_srgb,var(--color-warning)_12%,transparent)] p-3.5 text-sm text-[color-mix(in_srgb,var(--color-warning)_70%,var(--color-ink))]">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          Minimum order {money(minimumOrderAmount)}.
        </p>
      ) : null}
    </>
  );

  const checkout = (
    <Button
      size="lg"
      className="h-13 w-full justify-between rounded-full px-6"
      disabled={checkoutPending || belowMinimum || hasProblem}
      onClick={goToCheckout}
    >
      <span>{checkoutPending ? "Preparing your order…" : isSignedIn ? "Checkout" : "Sign in to check out"}</span>
      <span className="tabular flex items-center gap-2">
        {checkoutPending ? <Loader2 className="animate-spin" aria-hidden /> : (money(toMoney(round2(subtotal.minus(discount)))))}
        {!checkoutPending ? <ArrowRight aria-hidden /> : null}
      </span>
    </Button>
  );

  if (drawer) {
    return (
      <div className="flex min-h-full flex-col">
        <div className="flex-1 space-y-6 px-5 md:px-7">
          {orderTypePicker}
          {lines}
          {couponForm}
          <div className="rounded-[var(--radius-card)] bg-[var(--steel-1)] p-5">{receipt}</div>
          {notices}
        </div>
        <div className="sticky bottom-0 mt-6 border-t border-[var(--rule)] bg-[color-mix(in_srgb,var(--color-surface)_94%,transparent)] px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl md:px-7">
          {checkout}
        </div>
      </div>
    );
  }

  return (
    <div className="container-page pb-12 pt-8 md:pb-16 md:pt-12">
      <header className="border-b border-[var(--rule)] pb-6 md:pb-8">
        <p className="eyebrow mb-2.5">Your order</p>
        <h1 className="display-2 font-normal">My Cart</h1>
        <p className="tabular mt-2.5 text-[14.5px] leading-relaxed text-[var(--color-muted-ink)] md:text-[15px]">
          {itemCount} item{itemCount === 1 ? "" : "s"} from {restaurantName}. Delivery and tax are added at checkout.
        </p>
      </header>

      <div className="mt-7 grid grid-cols-[minmax(0,1fr)] gap-8 md:mt-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-12">
        <div>
          {orderTypePicker}
          <div className="mt-4">{lines}</div>
          <div className="mt-2 flex flex-col gap-6 border-t border-[var(--rule)] pt-6 sm:flex-row sm:items-start sm:justify-between">
            <Link
              href={`${home}/menu`}
              className="press inline-flex h-10 w-fit items-center gap-1.5 rounded-full border border-[var(--rule-strong)] px-4 text-sm font-semibold"
            >
              <Plus className="size-4" aria-hidden />
              Add more dishes
            </Link>
            {featureCoupons ? <div className="w-full sm:max-w-xs">{couponForm}</div> : null}
          </div>
        </div>

        <aside className="lg:sticky lg:top-[calc(var(--header-h,4.5rem)+1.5rem)] lg:self-start">
          <div className="tone-night rounded-[var(--radius-panel)] p-6 shadow-[var(--shadow-raised)] md:p-8">
            <h2 className="display-3">Order summary</h2>
            <p className="tabular mt-1 text-[13px] text-[var(--color-muted-ink)]">
              {ORDER_TYPE_LABELS[cart.orderType]} · {itemCount} item{itemCount === 1 ? "" : "s"}
            </p>
            <span aria-hidden className="mt-5 block h-px bg-[var(--rule)]" />
            <div className="mt-4">{receipt}</div>
            <div className="mt-5 space-y-3">{notices}</div>
            <div className="mt-6 hidden lg:block">{checkout}</div>
          </div>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--rule)] bg-[color-mix(in_srgb,var(--color-surface)_94%,transparent)] px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl lg:hidden">
        {checkout}
      </div>
    </div>
  );
}
