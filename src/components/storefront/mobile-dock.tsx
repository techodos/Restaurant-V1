"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  ClipboardList,
  House,
  Info,
  MapPin,
  Phone,
  Star,
  Store,
  User,
  UtensilsCrossed,
} from "lucide-react";
import { cn } from "@/shared/utils";
import { signInHref } from "@/shared/return-to";
import type { DockTab } from "@/shared/contract/settings";

interface MobileDockProps {
  restaurantSlug: string;
  activeOrders: number;
  reservationsEnabled: boolean;
  signedIn: boolean;
  /** links switched off in Website → Header & navigation: the dock drops those tabs too */
  disabledLinks?: string[];
  /** website.config.navigation.dock: hidden bar / chosen tabs in order (undefined = the default four) */
  dock?: { enabled: boolean; tabs?: DockTab[] | undefined };
  /** header link labels by address, so a renamed link is named the same in the bar */
  labels?: Record<string, string>;
}

const DEFAULT_TABS: DockTab[] = ["home", "menu", "book", "account"];
const TABS: Record<
  Exclude<DockTab, "account">,
  { href: string; label: string; Icon: typeof User }
> = {
  home: { href: "/", label: "Home", Icon: House },
  menu: { href: "/menu", label: "Menu", Icon: UtensilsCrossed },
  about: { href: "/about", label: "About", Icon: Info },
  contact: { href: "/contact", label: "Contact", Icon: Phone },
  book: { href: "/reservation", label: "Book", Icon: CalendarDays },
  reviews: { href: "/reviews", label: "Reviews", Icon: Star },
  locations: { href: "/locations", label: "Locations", Icon: Store },
};

/** Routes with their own sticky primary action: the dock steps aside there. */
function hiddenOn(pathname: string): boolean {
  return (
    pathname.startsWith(`/checkout`) ||
    pathname.startsWith(`/cart`) ||
    pathname.startsWith(`/reservation`) ||
    /\/menu\/[^/]+$/.test(pathname) ||
    pathname.startsWith(`/account/`)
  );
}

/**
 * Phones only: the thumb-reach dock. Home, Menu, Book (when reservations are on), then Track (only while
 * an order is live), My Orders (signed in) or Sign in. Home / Menu / Book follow the header's navigation switches. No cart here: the header's cart icon (top right,
 * with its count) is always visible on phones and is also the fly-to-cart target.
 * A floating night capsule, so it reads on paper and on dark sections alike.
 */
export function MobileDock({
  restaurantSlug,
  activeOrders,
  reservationsEnabled,
  signedIn,
  disabledLinks = [],
  dock,
  labels = {},
}: MobileDockProps) {
  const pathname = usePathname();
  const home = "/";
  // chosen in Website → Phone bottom bar; unset = the default four, minus links switched off in the header
  const tabs =
    dock?.tabs ??
    DEFAULT_TABS.filter(
      (key) => key === "account" || !disabledLinks.includes(TABS[key].href),
    );
  if (dock?.enabled === false || hiddenOn(pathname)) return null;

  const item = (
    href: string,
    label: string,
    Icon: typeof User,
    extra?: React.ReactNode,
    exact = false,
  ) => {
    // Home is active only on itself, every other tab on its sub-pages too
    const active =
      pathname === href || (!exact && pathname.startsWith(`${href}/`));
    return (
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "press relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-xs font-medium",
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
        {tabs.map((key) => (
          <Fragment key={key}>
            {(() => {
              if (key === "account") {
                return activeOrders > 0
                  ? item(
                      `/current-orders`,
                      "Track",
                      MapPin,
                      <span
                        aria-hidden
                        className="absolute right-[calc(50%-18px)] top-2.5 size-2 rounded-full bg-[var(--color-brand)]"
                      >
                        <span className="absolute inset-0 animate-ping rounded-full bg-[var(--color-brand)]" />
                      </span>,
                    )
                  : signedIn
                    ? item(`/orders`, "My Orders", ClipboardList)
                    : item(signInHref(pathname), "Sign in", User);
              }
              const tab = TABS[key];
              if (key === "book" && !reservationsEnabled) return null;
              return item(
                tab.href,
                labels[tab.href] || tab.label,
                tab.Icon,
                undefined,
                tab.href === "/",
              );
            })()}
          </Fragment>
        ))}
      </div>
    </nav>
  );
}
