"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Tag, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { applyCouponAction, clearCartAction } from "@/app/r/[restaurantSlug]/cart/actions";

interface CartPromoFormProps {
  restaurantSlug: string;
  appliedCode: string | null;
}

/** Promo codes are validated server-side by the pricing engine, never locally. */
export function CartPromoForm({ restaurantSlug, appliedCode }: CartPromoFormProps) {
  const [code, setCode] = useState("");
  const [pending, startTransition] = useTransition();
  const [clearing, startClearing] = useTransition();
  const router = useRouter();

  if (appliedCode) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-[var(--radius-card)] border border-dashed border-[var(--rule-strong)] px-4 py-3">
        <span className="inline-flex items-center gap-2 text-sm font-medium">
          <Tag className="size-4 text-[var(--color-brand)]" aria-hidden />
          {appliedCode} applied
        </span>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-sm text-[var(--color-muted-ink)] hover:text-[var(--color-danger)]"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await applyCouponAction(restaurantSlug, { code: "" });
              if (!result.success) {
                toast.error(result.error.message);
                return;
              }
              toast.success("Promo code removed");
              router.refresh();
            })
          }
        >
          {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <X className="size-3.5" aria-hidden />}
          Remove
        </button>
      </div>
    );
  }

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        const value = code.trim();
        if (!value) return;
        startTransition(async () => {
          const result = await applyCouponAction(restaurantSlug, { code: value });
          if (!result.success) {
            toast.error(result.error.message);
            return;
          }
          toast.success(`Promo code ${result.data.code} applied`);
          setCode("");
          router.refresh();
        });
      }}
    >
      <Label htmlFor="promo-code">Promo code</Label>
      <div className="flex gap-2">
        <Input
          id="promo-code"
          name="code"
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="Enter code"
          autoComplete="off"
          className="uppercase"
        />
        <Button type="submit" variant="outline" className="rounded-full" disabled={pending || !code.trim()}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : "Apply"}
        </Button>
      </div>
      <Button
        type="button"
        variant="link"
        size="sm"
        className="text-xs text-[var(--color-muted-ink)]"
        disabled={clearing}
        onClick={() =>
          startClearing(async () => {
            const result = await clearCartAction(restaurantSlug);
            if (!result.success) {
              toast.error(result.error.message);
              return;
            }
            toast.success("Cart emptied");
            router.refresh();
          })
        }
      >
        Empty cart
      </Button>
    </form>
  );
}
