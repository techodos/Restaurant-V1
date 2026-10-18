"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { updateWhatsAppNumberAction } from "@/app/admin/(dashboard)/settings/actions";
import type { CheckoutMode } from "@/shared/contract/enums";
import { normalizeWhatsAppNumber, whatsappDigits } from "@/shared/whatsapp-order";

/**
 * Settings → WhatsApp ordering. The owner/admin (or one of our agents) keeps the restaurant's WhatsApp number
 * current; whether checkout hands orders to it is the platform's switch (super admin → Checkout), shown read-only.
 * Branches can override the number (Locations).
 */
export function WhatsAppSettingsSection({
  whatsapp,
  checkoutMode,
  readOnly,
}: {
  whatsapp: string | null;
  checkoutMode: CheckoutMode;
  readOnly: boolean;
}) {
  const [value, setValue] = useState(whatsapp ?? "");
  const [saved, setSaved] = useState(whatsapp ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const dirty = value.trim() !== saved.trim();
  const digits = whatsappDigits(value);
  const on = checkoutMode === "whatsapp";

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (normalizeWhatsAppNumber(value) === null) {
      setError("Enter a WhatsApp number with country code, e.g. +92 300 1234567.");
      return;
    }
    setError(null);
    startTransition(() => {
      updateWhatsAppNumberAction({ whatsapp: value }).then((result) => {
        if (!result.success) {
          setError(result.error.message);
          toast.error(result.error.message);
          return;
        }
        const stored = result.data.whatsapp ?? "";
        setValue(stored);
        setSaved(stored);
        toast.success("WhatsApp number saved.");
        router.refresh();
      });
    });
  }

  return (
    <section id="settings-whatsapp" aria-labelledby="settings-whatsapp-title" className="surface-card scroll-mt-24 overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--color-hairline)] px-5 py-4">
        <div>
          <h2 id="settings-whatsapp-title" className="text-[15px] font-semibold leading-6">
            WhatsApp ordering
          </h2>
          <p className="text-[13px] leading-5 text-[var(--color-muted-ink)]">
            The number customers reach on WhatsApp. With WhatsApp checkout on, every order is sent here.
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
            on ? "bg-[color-mix(in_srgb,#25D366_16%,var(--color-surface))] text-[#146c38]" : "bg-[var(--tint)] text-[var(--color-muted-ink)]"
          }`}
        >
          <MessageCircle className="size-3.5" aria-hidden />
          {on ? "WhatsApp checkout on" : "Standard checkout"}
        </span>
      </header>
      <form onSubmit={submit}>
        <fieldset disabled={readOnly || pending} className="space-y-2 px-5 py-5">
          <Label htmlFor="restaurantWhatsapp">WhatsApp number</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="restaurantWhatsapp"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+92 300 1234567"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              aria-invalid={Boolean(error)}
              aria-describedby="restaurantWhatsapp-hint"
              className="max-w-xs"
            />
            {digits ? (
              <Button asChild variant="outline" size="sm">
                <a href={`https://wa.me/${digits}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" aria-hidden />
                  Test: open chat
                </a>
              </Button>
            ) : null}
          </div>
          <p id="restaurantWhatsapp-hint" className="text-xs text-[var(--color-muted-ink)]">
            With country code. A branch can use its own number (Locations). {on ? "Checkout mode is set by the TechOdos team." : ""}
          </p>
          {error ? <p className="text-[13px] font-medium text-[var(--color-danger)]">{error}</p> : null}
        </fieldset>
        {!readOnly ? (
          <div className="flex items-center justify-end gap-3 border-t border-[var(--color-hairline)] bg-[color-mix(in_srgb,var(--color-ink)_2%,var(--color-surface))] px-5 py-3">
            <Button type="submit" size="sm" disabled={pending || !dirty}>
              {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {pending ? "Saving" : "Save changes"}
            </Button>
          </div>
        ) : null}
      </form>
    </section>
  );
}
