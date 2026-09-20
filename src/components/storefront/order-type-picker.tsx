"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { setOrderTypeAction } from "@/app/r/[restaurantSlug]/cart/actions";
import { ORDER_TYPE_LABELS, type OrderType } from "@/shared/contract/enums";
import { cn } from "@/shared/utils";

interface OrderTypePickerProps {
  restaurantSlug: string;
  current: OrderType;
  available: OrderType[];
  labels?: Partial<Record<OrderType, string>>;
}

/** Order type lives on the cart row in the database, not in component state. */
export function OrderTypePicker({ restaurantSlug, current, available, labels }: OrderTypePickerProps) {
  const [pending, startTransition] = useTransition();
  const [busyType, setBusyType] = useState<OrderType | null>(null);
  const router = useRouter();

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Order type">
      {available.map((type) => (
        <button
          key={type}
          type="button"
          aria-pressed={current === type}
          disabled={pending}
          onClick={() => {
            if (type === current) return;
            setBusyType(type);
            startTransition(async () => {
              const result = await setOrderTypeAction(restaurantSlug, { orderType: type });
              setBusyType(null);
              if (!result.success) {
                toast.error(result.error.message);
                return;
              }
              router.refresh();
            });
          }}
          className={cn(
            "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-colors disabled:opacity-60",
            current === type
              ? "border-[var(--color-brand)] bg-[var(--color-brand)] text-[var(--color-brand-foreground)]"
              : "border-[var(--color-hairline)] bg-[var(--color-surface)] hover:border-[var(--color-brand)]",
          )}
        >
          {busyType === type ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
          {labels?.[type] ?? ORDER_TYPE_LABELS[type]}
        </button>
      ))}
    </div>
  );
}
