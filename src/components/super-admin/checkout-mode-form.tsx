"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MessageCircle, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import { saveCheckoutModeAction } from "@/app/super-admin/actions";
import { Panel, SaveBar, StatusBadge } from "@/components/super-admin/ui";
import { Field } from "@/components/super-admin/form-parts";
import type { CheckoutMode } from "@/shared/contract/enums";
import { cn } from "@/shared/utils";
import { normalizeWhatsAppNumber, whatsappDigits } from "@/shared/whatsapp-order";

const MODES: { value: CheckoutMode; title: string; description: string; icon: typeof ShoppingCart }[] = [
  {
    value: "standard",
    title: "Standard checkout",
    description: "Full online checkout: email verification, all enabled payment methods, live order tracking. The team runs orders in the admin.",
    icon: ShoppingCart,
  },
  {
    value: "whatsapp",
    title: "WhatsApp checkout",
    description: "For restaurants without a laptop: the customer checks out (name + phone, cash only) and sends the order to the restaurant's WhatsApp. Orders are still saved here.",
    icon: MessageCircle,
  },
];

/** Super admin → Features: how this restaurant takes orders (phase 1 WhatsApp hand-off) + its WhatsApp number. */
export function CheckoutModeForm({ restaurantId, checkoutMode, whatsapp }: { restaurantId: string; checkoutMode: CheckoutMode; whatsapp: string | null }) {
  const initial = { checkoutMode, whatsapp: whatsapp ?? "" };
  const [saved, setSaved] = useState(initial);
  const [state, setState] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const dirty = state.checkoutMode !== saved.checkoutMode || state.whatsapp.trim() !== saved.whatsapp.trim();
  const digits = whatsappDigits(state.whatsapp);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const normalised = normalizeWhatsAppNumber(state.whatsapp);
    if (normalised === null) return setError("Enter a WhatsApp number with country code, e.g. +92 300 1234567.");
    if (state.checkoutMode === "whatsapp" && !normalised) return setError("WhatsApp checkout needs the restaurant's WhatsApp number.");
    setError(null);
    startTransition(() => {
      saveCheckoutModeAction(restaurantId, { checkoutMode: state.checkoutMode, whatsapp: state.whatsapp }).then((result) => {
        if (!result.success) {
          setError(result.error.message);
          return void toast.error(result.error.message);
        }
        const next = { checkoutMode: state.checkoutMode, whatsapp: normalised };
        setSaved(next);
        setState(next);
        toast.success("Checkout saved.");
        router.refresh();
      });
    });
  }

  return (
    <form onSubmit={submit}>
      <Panel
        title="Checkout"
        description="How customers place orders on this restaurant's website."
        icon={ShoppingCart}
        meta={<StatusBadge tone={saved.checkoutMode === "whatsapp" ? "success" : "neutral"}>{saved.checkoutMode === "whatsapp" ? "WhatsApp" : "Standard"}</StatusBadge>}
        bodyClassName="space-y-4 py-4"
      >
        <fieldset disabled={pending} className="grid gap-3 sm:grid-cols-2">
          <legend className="sr-only">Checkout mode</legend>
          {MODES.map((mode) => {
            const selected = state.checkoutMode === mode.value;
            return (
              <label
                key={mode.value}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-[var(--radius-brand)] border p-4 transition-colors",
                  selected
                    ? "border-[var(--color-brand)] bg-[color-mix(in_srgb,var(--color-brand)_6%,var(--color-surface))] ring-1 ring-[var(--color-brand)]"
                    : "border-[var(--color-hairline)] hover:bg-[var(--sa-subtle,var(--tint))]",
                )}
              >
                <input
                  type="radio"
                  name="checkoutMode"
                  value={mode.value}
                  checked={selected}
                  onChange={() => setState((current) => ({ ...current, checkoutMode: mode.value }))}
                  className="mt-1 size-4 accent-[var(--color-brand)]"
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <mode.icon className="size-4" aria-hidden />
                    {mode.title}
                  </span>
                  <span className="mt-1 block text-[13px] leading-5 text-[var(--color-muted-ink)]">{mode.description}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
        <Field
          label="Restaurant WhatsApp number"
          hint="With country code. The owner/admin can also change it in Settings; a branch can override it in Locations."
        >
          <div className="flex flex-wrap items-center gap-2">
            <input
              inputMode="tel"
              placeholder="+92 300 1234567"
              value={state.whatsapp}
              disabled={pending}
              onChange={(event) => setState((current) => ({ ...current, whatsapp: event.target.value }))}
              className="max-w-xs"
              aria-invalid={Boolean(error)}
            />
            {digits ? (
              <a href={`https://wa.me/${digits}`} target="_blank" rel="noopener noreferrer" className="text-[13px] font-medium text-[var(--color-brand)] underline underline-offset-4">
                Test: open chat
              </a>
            ) : null}
          </div>
        </Field>
        {error ? <p className="text-[13px] font-medium text-[var(--color-danger)]">{error}</p> : null}
      </Panel>
      <SaveBar dirty={dirty} pending={pending} onDiscard={() => { setState(saved); setError(null); }} />
    </form>
  );
}
