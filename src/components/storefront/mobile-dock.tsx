"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, MapPin, ShoppingBag, User, UtensilsCrossed } from "lucide-react";
import { cn } from "@/shared/utils";
import { TrayCount } from "./tray-count";

interface MobileDockProps {
  restaurantSlug: string;
  itemCount: number;
  activeOrders: number;
  showCart: boolean;
  reservationsEnabled: boolean;
  accountHref: string;
}

/** Routes with their own sticky primary action: the dock steps aside there. */
function hiddenOn(pathname: string, home: string): boolean {
  return (
    pathname.startsWith(`${home}/checkout`) ||
    pathname.startsWith(`${home}/cart`) ||
    pathname.startsWith(`${home}/reservation`) ||
    /\/menu\/[^/]+$/.test(pathname) ||
    pathname.startsWith(`${home}/account/`)
  );
}

/**
 * Phones only: the thumb-reach dock. Menu, Book (when reservations are on), Track (only while an order
 * is live) or Account, and the Cart, which is the brand-coloured next action and the fly-to-cart target.
 * A floating night capsule, so it reads on paper and on dark sections alike.
 */
export function MobileDock({ restaurantSlug, itemCount, activeOrders, showCart, reservationsEnabled, accountHref }: MobileDockProps) {
  const pathname = usePathname();
  const home = `/r/${restaurantSlug}`;
  if (hiddenOn(pathname, home)) return null;

  const item = (href: string, label: string, Icon: typeof User, extra?: React.ReactNode) => {
    const active = pathname === href || pathname.startsWith(`${href}/`);
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "press relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium",
          active ? "text-[var(--color-ink)]" : "text-[var(--color-muted-ink)]",
        )}
      >
        <Icon className="size-5" aria-hidden />
        {label}
        {extra}
      </Link>
    );
  };

  return (
    <nav
      aria-label="Quick actions"
      className="tone-night fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-40 rounded-[calc(var(--radius-panel)+6px)] border border-[var(--rule)] !bg-[color-mix(in_srgb,var(--color-night)_90%,transparent)] shadow-[0_18px_40px_-16px_rgb(0_0_0/0.55)] backdrop-blur-xl md:hidden"
    >
      <div className="flex h-[3.75rem] items-stretch gap-1 px-1.5">
        {item(`${home}/menu`, "Menu", UtensilsCrossed)}
        {reservationsEnabled ? item(`${home}/reservation`, "Book", CalendarDays) : null}
        {activeOrders > 0
          ? item(
              `${home}/current-orders`,
              "Track",
              MapPin,
              <span aria-hidden className="absolute right-[calc(50%-18px)] top-2.5 size-2 rounded-full bg-[var(--color-brand)]">
                <span className="absolute inset-0 animate-ping rounded-full bg-[var(--color-brand)]" />
              </span>,
            )
          : item(accountHref, "Account", User)}
        {showCart ? (
          <Link
            href={`${home}/cart`}
            data-tray-target
            aria-label={`Cart, ${itemCount} item${itemCount === 1 ? "" : "s"}`}
            className={cn(
              "press my-1.5 ml-1 flex flex-[1.4] items-center justify-center gap-2 rounded-[calc(var(--radius-panel)+2px)] text-sm font-semibold",
              itemCount > 0
                ? "bg-[var(--color-brand)] text-[var(--color-brand-foreground)]"
                : "bg-[var(--steel-2)] text-[var(--color-ink)]",
            )}
          >
            <ShoppingBag className="size-[18px]" aria-hidden />
            Cart
            <span className={cn("grid h-5 min-w-5 place-items-center rounded-full px-1 text-[11px]", itemCount > 0 ? "bg-black/15" : "bg-[var(--color-canvas)]")}>
              <TrayCount count={itemCount} />
            </span>
          </Link>
        ) : null}
      </div>
    </nav>
  );
}
