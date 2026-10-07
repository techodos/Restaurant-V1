"use client";

import { useEffect } from "react";
import type { OrderType } from "@/shared/contract/enums";
import { useBranching } from "./branching";
import { useLocalCart } from "./local-cart";

/**
 * The menu's order-type tab, carried into the tray (multi-branch ordering only; renders nothing). When the
 * customer picks a tab explicitly (`?orderType=`), it becomes the tray's order type, so the header's branch
 * pill, the add controls and the cart all talk about the same order. The visible location / branch context
 * lives in the header (`header-branch-pill.tsx`) since 2026-10-07; this used to be the menu's
 * "Delivering to / Serving from" strip.
 */
export function MenuOrderTypeSync({ orderType, explicit }: { orderType: OrderType; explicit: boolean }) {
  const branching = useBranching();
  const { cart, setOrderType } = useLocalCart();

  useEffect(() => {
    if (branching.enabled && explicit && cart.orderType !== orderType) setOrderType(orderType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branching.enabled, explicit, orderType]);

  return null;
}
