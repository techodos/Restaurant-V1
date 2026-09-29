"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ClipboardList, House, MapPin, User, UtensilsCrossed } from "lucide-react";
import { cn } from "@/shared/utils";
import { signInHref } from "@/shared/return-to";

interface MobileDockProps {
  restaurantSlug: string;
  activeOrders: number;
  reservationsEnabled: boolean;
  signedIn: boolean;
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
 * Phones only: the thumb-reach dock. Home, Menu, Book (when reservations are on), then Track (only while
 * an order is live), My Orders (signed in) or Sign in. No cart here: the header's cart icon (top right,
 * with its count) is always visible on phones and is also the fly-to-cart target.
 * A floating night capsule, so it reads on paper and on dark sections alike.
 */
export function MobileDock({ restaurantSlug, activeOrders, reservationsEnabled, signedIn }: MobileDockProps) {
  const pathname = usePathname();
  const home = `/r/${restaurantSlug}`;
  if (hiddenOn(pathname, home)) return null;

  const item = (href: string, label: string, Icon: typeof User, extra?: React.ReactNode, exact = false) => {
    // Home is active only on itself, every other tab on its sub-pages too
    const active = pathname === href || (!exact && pathname.startsWith(`${href}/`));
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
        <span className="max-w-full truncate px-0.5">{label}</span>
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
        {item(home, "Home", House, undefined, true)}
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
          : signedIn
            ? item(`${home}/orders`, "My Orders", ClipboardList)
            : item(signInHref(restaurantSlug, pathname), "Sign in", User)}
      </div>
    </nav>
  );
}
