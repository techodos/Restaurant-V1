"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/shared/utils";
import { addToCartAction } from "@/app/r/[restaurantSlug]/cart/actions";
import { flyToTray } from "@/components/motion/fly-to-tray";

interface QuickAddButtonProps {
  restaurantSlug: string;
  item: { id: string; name: string; slug: string; requiresSelection: boolean; isAvailable: boolean };
  orderType?: string | undefined;
  /** smaller control for menu rows */
  compact?: boolean;
}

const ROUND =
  "press grid place-items-center rounded-full border border-black/5 shadow-[0_8px_20px_-8px_rgb(0_0_0/0.45)] transition-[background-color,color,transform] duration-200 hover:scale-105";
const IDLE = "bg-[var(--brand-surface,#fff)] text-[var(--brand-foreground,#1a1a1a)]";

/**
 * A dish's add control. A simple dish goes straight into the cart (its photo flies there);
 * a dish with required choices opens its sheet instead, because the server requires those choices.
 */
export function QuickAddButton({ restaurantSlug, item, orderType, compact = false }: QuickAddButtonProps) {
  const size = compact ? "size-9 [&_svg]:size-4" : "size-11 [&_svg]:size-5";
  const [pending, startTransition] = useTransition();
  const [added, setAdded] = useState(false);
  const router = useRouter();

  if (!item.isAvailable) return null;

  if (item.requiresSelection) {
    return (
      <Link
        href={`/r/${restaurantSlug}/menu/${item.slug}${orderType ? `?orderType=${orderType}` : ""}`}
        scroll={false}
        aria-label={`Choose options for ${item.name}`}
        className={cn(ROUND, size, IDLE)}
      >
        <Plus aria-hidden />
      </Link>
    );
  }

  return (
    <button
      type="button"
      data-testid={`quick-add-${item.slug}`}
      aria-label={added ? `${item.name} added to your order` : `Add ${item.name} to your order`}
      disabled={pending}
      className={cn(
        ROUND,
        size,
        added ? "bg-[var(--brand-primary,var(--color-brand))] text-[var(--brand-primary-foreground,#fff)]" : IDLE,
      )}
      onClick={(event) => {
        const plateImage = event.currentTarget.closest("[data-dish]")?.querySelector("img") ?? null;
        startTransition(async () => {
          const result = await addToCartAction(restaurantSlug, {
            menuItemId: item.id,
            quantity: 1,
            addons: [],
            ...(orderType ? { orderType } : {}),
          });
          if (!result.success) {
            toast.error(result.error.message);
            return;
          }
          flyToTray(plateImage);
          setAdded(true);
          window.setTimeout(() => setAdded(false), 1600);
          toast.success(`${item.name} added to your order`);
          router.refresh();
        });
      }}
    >
      {pending ? (
        <Loader2 className="animate-spin" aria-hidden />
      ) : added ? (
        <Check aria-hidden />
      ) : (
        <Plus aria-hidden />
      )}
    </button>
  );
}
