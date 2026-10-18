"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useLocalCart } from "@/components/storefront/local-cart";
import type { OrderType } from "@/shared/contract/enums";

/**
 * One order-type door. Marks itself `data-selected` / `aria-current` when it matches the tray's order type
 * (the same value the header bar and checkout read) AND the visitor has chosen one themselves — on a first visit no
 * door is pre-selected, although the cart carries the restaurant's default type. Choosing it sets that order type straight away —
 * the menu link's ?orderType= still applies it on the next add, as before.
 */
export function OrderTypeDoor({ type, ...props }: ComponentProps<typeof Link> & { type: OrderType }) {
  const { cart, setOrderType, orderTypeChosen } = useLocalCart();
  const selected = orderTypeChosen && cart.orderType === type;
  return (
    <Link
      {...props}
      aria-current={selected ? "true" : undefined}
      data-selected={selected || undefined}
      onClick={() => setOrderType(type)}
    />
  );
}
