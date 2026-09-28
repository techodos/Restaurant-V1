"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Decimal from "decimal.js";
import { dec, round2, toMoney } from "@/shared/money";
import type { OrderType } from "@/shared/contract/enums";
import {
  encodeTray,
  TRAY_COOKIE_MAX_AGE,
  trayCookieName,
  trayFitsCookie,
  type InitialTray,
  type Tray,
  type TrayLineDisplay,
} from "@/shared/tray";

/**
 * The tray (cart), kept entirely in the browser — in a cookie, never the database (DECISIONS.md §28).
 *
 * Adding, changing and removing lines only rewrites the cookie (`document.cookie`): no request at all.
 * The server reads the same cookie when it renders (layout → header badge and drawer on first paint,
 * /checkout) and prices it from the in-memory menu; placing the order is the one database write, and it
 * re-resolves every line from the live database. `display` is how a line is shown — from the server on a
 * page load, or captured from the menu data the add button already had — never trusted for pricing.
 *
 * The reducer functions below are pure and exported separately from the React context so the tray's
 * logic can be unit tested without a DOM (see tests/local-cart.test.ts).
 */

export interface LocalCartAddon {
  addonId: string;
  quantity: number;
}

export interface LocalCartLine {
  /** client-side only (React key / edit target); never stored */
  id: string;
  menuItemId: string;
  variantId: string | null;
  quantity: number;
  addons: LocalCartAddon[];
  specialInstructions?: string;
  display: TrayLineDisplay;
}

export interface LocalCart {
  orderType: OrderType;
  locationId: string | null;
  couponCode: string | null;
  /** the promo preview's discount; cleared whenever the code changes */
  couponDiscount: string | null;
  lines: LocalCartLine[];
}

export function emptyLocalCart(orderType: OrderType): LocalCart {
  return { orderType, locationId: null, couponCode: null, couponDiscount: null, lines: [] };
}

export interface AddLineInput {
  menuItemId: string;
  variantId: string | null;
  quantity: number;
  addons: LocalCartAddon[];
  specialInstructions?: string;
  display: TrayLineDisplay;
}

let lineSequence = 0;
function newLineId(): string {
  lineSequence += 1;
  return `line-${Date.now().toString(36)}-${lineSequence}`;
}

/** Mirrors the order: every add is its own line, never merged with an identical one. */
export function addLocalLine(cart: LocalCart, input: AddLineInput): LocalCart {
  const line: LocalCartLine = {
    id: newLineId(),
    menuItemId: input.menuItemId,
    variantId: input.variantId,
    quantity: Math.min(Math.max(Math.trunc(input.quantity) || 1, 1), 99),
    addons: input.addons.map((addon) => ({ addonId: addon.addonId, quantity: addon.quantity })),
    ...(input.specialInstructions ? { specialInstructions: input.specialInstructions } : {}),
    display: input.display,
  };
  return { ...cart, lines: [...cart.lines, line] };
}

/** quantity <= 0 removes the line. */
export function updateLocalLineQuantity(cart: LocalCart, lineId: string, quantity: number): LocalCart {
  if (quantity <= 0) return removeLocalLine(cart, lineId);
  const capped = Math.min(Math.trunc(quantity), 99);
  return { ...cart, lines: cart.lines.map((line) => (line.id === lineId ? { ...line, quantity: capped } : line)) };
}

export function removeLocalLine(cart: LocalCart, lineId: string): LocalCart {
  return { ...cart, lines: cart.lines.filter((line) => line.id !== lineId) };
}

export function clearLocalCart(cart: LocalCart): LocalCart {
  return { ...cart, lines: [], couponCode: null, couponDiscount: null };
}

export function setLocalOrderType(cart: LocalCart, orderType: OrderType): LocalCart {
  return { ...cart, orderType };
}

export function setLocalLocationId(cart: LocalCart, locationId: string | null): LocalCart {
  return { ...cart, locationId };
}

export function setLocalCoupon(cart: LocalCart, code: string | null, discount: string | null): LocalCart {
  return { ...cart, couponCode: code, couponDiscount: discount };
}

export function localLineTotal(line: LocalCartLine): Decimal {
  if (line.display.problem) return new Decimal(0);
  return round2(dec(line.display.unitPrice).plus(dec(line.display.addonsTotal)).times(line.quantity));
}

export function localCartItemCount(cart: LocalCart): number {
  return cart.lines.reduce((total, line) => total + line.quantity, 0);
}

/** Sum of orderable line totals, before any coupon/delivery/tax — those are confirmed at checkout. */
export function localCartSubtotal(cart: LocalCart): Decimal {
  return cart.lines.reduce((total, line) => total.plus(localLineTotal(line)), new Decimal(0));
}

/** What goes into the cookie: ids and quantities only. */
export function toTray(cart: LocalCart): Tray {
  return {
    orderType: cart.orderType,
    locationId: cart.locationId,
    couponCode: cart.couponCode,
    lines: cart.lines.map((line) => ({
      menuItemId: line.menuItemId,
      variantId: line.variantId,
      quantity: line.quantity,
      addons: line.addons,
      ...(line.specialInstructions ? { specialInstructions: line.specialInstructions } : {}),
    })),
  };
}

/** The server's reading of the cookie → client state. Ids are positional so server and client HTML match. */
export function fromInitialTray(initial: InitialTray): LocalCart {
  return {
    orderType: initial.tray.orderType,
    locationId: initial.tray.locationId,
    couponCode: initial.tray.couponCode,
    couponDiscount: initial.couponDiscount,
    lines: initial.tray.lines.map((line, index) => ({
      id: `initial-${index}`,
      menuItemId: line.menuItemId,
      variantId: line.variantId,
      quantity: line.quantity,
      addons: line.addons,
      ...(line.specialInstructions ? { specialInstructions: line.specialInstructions } : {}),
      display: initial.displays[index] ?? {
        name: "Item",
        slug: null,
        imageUrl: null,
        variantName: null,
        addonNames: [],
        unitPrice: "0.00",
        addonsTotal: "0.00",
        problem: null,
      },
    })),
  };
}

// ─── React wiring ──────────────────────────────────────────────────────────────

interface LocalCartContextValue {
  cart: LocalCart;
  itemCount: number;
  subtotal: string;
  /** false when the line would not fit in the tray cookie (the tray is full) */
  addLine: (input: AddLineInput) => boolean;
  /** adds several lines at once (reorder); returns how many fitted */
  addLines: (inputs: AddLineInput[]) => number;
  updateQuantity: (lineId: string, quantity: number) => void;
  removeLine: (lineId: string) => void;
  clear: () => void;
  setOrderType: (orderType: OrderType) => void;
  setLocationId: (locationId: string | null) => void;
  setCoupon: (code: string | null, discount: string | null) => void;
}

const LocalCartContext = createContext<LocalCartContextValue | null>(null);

function readCookie(name: string): string {
  const prefix = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) return trimmed.slice(prefix.length);
  }
  return "";
}

function writeCookie(name: string, value: string): void {
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = value
    ? `${name}=${value}; path=/; max-age=${TRAY_COOKIE_MAX_AGE}; samesite=lax${secure}`
    : `${name}=; path=/; max-age=0; samesite=lax${secure}`;
}

function encodeCart(cart: LocalCart): string {
  return cart.lines.length || cart.couponCode ? encodeTray(toTray(cart)) : "";
}

export function LocalCartProvider({
  restaurantSlug,
  initial,
  children,
}: {
  restaurantSlug: string;
  initial: InitialTray;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const cookieName = trayCookieName(restaurantSlug);
  // Starts from what the server read out of the same cookie, so the first client render matches the
  // server's HTML exactly (badge count included) — no empty-then-filled flash.
  const [cart, setCart] = useState<LocalCart>(() => fromInitialTray(initial));
  const cartRef = useRef(cart);
  cartRef.current = cart;

  // The cookie is written here, synchronously, not only in the effect below: a caller that changes the
  // tray and then asks the server for a page (checkout's branch picker: setLocationId + router.refresh)
  // must send the NEW cookie. Written only from the effect, the refresh could go out first, render the
  // old tray, and the "adopt the server's reading" effect would then undo the change.
  const commit = useCallback(
    (next: LocalCart) => {
      cartRef.current = next;
      const encoded = encodeCart(next);
      if (encoded !== readCookie(cookieName)) writeCookie(cookieName, encoded);
      setCart(next);
    },
    [cookieName],
  );

  // The server re-rendered the layout (navigation refresh, a server action, another tab's change
  // picked up below) with a different cookie than this state holds: adopt the server's reading.
  useEffect(() => {
    if (initial.encoded !== encodeCart(cartRef.current)) commit(fromInitialTray(initial));
  }, [initial, commit]);

  // Persist every change (already written by `commit`; this is the safety net). Writing the cookie IS
  // the whole "add to cart" — no request.
  useEffect(() => {
    const encoded = encodeCart(cart);
    if (encoded !== readCookie(cookieName)) writeCookie(cookieName, encoded);
  }, [cart, cookieName]);

  // Another tab changed the tray: when this tab is looked at again, let the server re-price it.
  useEffect(() => {
    function onFocus() {
      if (document.visibilityState === "hidden") return;
      if (readCookie(cookieName) !== encodeCart(cartRef.current)) router.refresh();
    }
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [cookieName, router]);

  const addLines = useCallback(
    (inputs: AddLineInput[]) => {
      let next = cartRef.current;
      let added = 0;
      for (const input of inputs) {
        const candidate = addLocalLine(next, input);
        if (!trayFitsCookie(toTray(candidate))) break;
        next = candidate;
        added += 1;
      }
      if (added > 0) commit(next);
      return added;
    },
    [commit],
  );
  const addLine = useCallback((input: AddLineInput) => addLines([input]) === 1, [addLines]);
  const updateQuantity = useCallback(
    (lineId: string, quantity: number) => commit(updateLocalLineQuantity(cartRef.current, lineId, quantity)),
    [commit],
  );
  const removeLine = useCallback((lineId: string) => commit(removeLocalLine(cartRef.current, lineId)), [commit]);
  const clear = useCallback(() => commit(clearLocalCart(cartRef.current)), [commit]);
  const setOrderType = useCallback((orderType: OrderType) => commit(setLocalOrderType(cartRef.current, orderType)), [commit]);
  const setLocationId = useCallback(
    (locationId: string | null) => commit(setLocalLocationId(cartRef.current, locationId)),
    [commit],
  );
  const setCoupon = useCallback(
    (code: string | null, discount: string | null) => commit(setLocalCoupon(cartRef.current, code, discount)),
    [commit],
  );

  const value = useMemo<LocalCartContextValue>(
    () => ({
      cart,
      itemCount: localCartItemCount(cart),
      subtotal: toMoney(localCartSubtotal(cart)),
      addLine,
      addLines,
      updateQuantity,
      removeLine,
      clear,
      setOrderType,
      setLocationId,
      setCoupon,
    }),
    [cart, addLine, addLines, updateQuantity, removeLine, clear, setOrderType, setLocationId, setCoupon],
  );

  return <LocalCartContext.Provider value={value}>{children}</LocalCartContext.Provider>;
}

export function useLocalCart(): LocalCartContextValue {
  const ctx = useContext(LocalCartContext);
  if (!ctx) throw new Error("useLocalCart must be used inside <LocalCartProvider>");
  return ctx;
}
