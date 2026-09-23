"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu as MenuIcon, ShoppingBag, User, X } from "lucide-react";
import type { WebsiteConfig } from "@/shared/contract/settings";
import { cn } from "@/shared/utils";

interface SiteHeaderProps {
  restaurant: { name: string; slug: string; logoUrl: string | null; phone: string | null };
  config: WebsiteConfig;
  itemCount: number;
  orderingOpen: boolean;
  /** null while no customer sign-in system was reachable (never blocks rendering). */
  customer: { signedIn: boolean; name: string | null } | null;
  googleEnabled: boolean;
}

/** Navigation labels, order and links all come from websites.config.navigation. */
export function SiteHeader({ restaurant, config, itemCount, orderingOpen, customer, googleEnabled }: SiteHeaderProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const navItems = config.navigation.items;
  const announcement = config.announcement;

  return (
    <header className={cn("z-40 w-full border-b border-[var(--color-hairline)] bg-[var(--color-surface)]/95 backdrop-blur", config.navigation.sticky && "sticky top-0")}>
      {announcement.enabled && announcement.text ? (
        <div className="bg-[var(--color-brand)] px-4 py-2 text-center text-sm text-[var(--color-brand-foreground)]">
          {announcement.text}
          {announcement.linkHref && announcement.linkLabel ? (
            <Link href={announcement.linkHref} className="ml-2 font-medium underline underline-offset-2">
              {announcement.linkLabel}
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="container-page flex h-16 items-center justify-between gap-4 md:h-20">
        <Link href={`/r/${restaurant.slug}`} className="flex items-center gap-3" aria-label={`${restaurant.name} home`}>
          {restaurant.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- DB-provided logo, dimensions unknown
            <img src={restaurant.logoUrl} alt="" className="h-10 w-auto" />
          ) : (
            <span
              aria-hidden
              className="grid size-10 place-items-center rounded-[var(--radius-brand)] bg-[var(--color-brand)] font-semibold text-[var(--color-brand-foreground)]"
            >
              {restaurant.name.slice(0, 1)}
            </span>
          )}
          <span className="font-[family-name:var(--font-heading)] text-lg font-semibold leading-tight md:text-xl">
            {restaurant.name}
          </span>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-[var(--radius-brand)] px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-[color-mix(in_srgb,var(--color-brand)_10%,transparent)] text-[var(--color-brand)]"
                    : "text-[var(--color-ink)] hover:bg-[color-mix(in_srgb,var(--color-ink)_6%,transparent)]",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {config.navigation.showCart ? (
            <Link
              href={`/r/${restaurant.slug}/cart`}
              aria-label={`Cart, ${itemCount} item${itemCount === 1 ? "" : "s"}`}
              className="relative grid size-11 place-items-center rounded-full border border-[var(--color-hairline)] text-[var(--color-ink)] transition-colors hover:border-[var(--color-brand)] hover:text-[var(--color-brand)]"
            >
              <ShoppingBag className="size-5" aria-hidden />
              {itemCount > 0 ? (
                <span
                  aria-hidden
                  className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--color-brand)] px-1 text-[11px] font-semibold leading-none text-[var(--color-brand-foreground)]"
                >
                  {itemCount > 99 ? "99+" : itemCount}
                </span>
              ) : null}
            </Link>
          ) : null}

          {customer?.signedIn ? (
            <Link
              href={`/r/${restaurant.slug}/account`}
              className="hidden items-center gap-2 rounded-full bg-[var(--color-brand)] px-4 py-2.5 text-sm font-medium text-[var(--color-brand-foreground)] shadow-sm transition-opacity hover:opacity-90 sm:flex"
            >
              <User className="size-4" aria-hidden />
              <span className="max-w-28 truncate">{customer.name ?? "Account"}</span>
            </Link>
          ) : (
            <Link
              href={`/r/${restaurant.slug}/account/sign-in`}
              className="hidden items-center gap-2 rounded-full bg-[var(--color-brand)] px-4 py-2.5 text-sm font-medium text-[var(--color-brand-foreground)] shadow-sm transition-opacity hover:opacity-90 sm:flex"
            >
              <User className="size-4" aria-hidden />
              Sign In / Sign Up
            </Link>
          )}

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            className="grid size-11 place-items-center rounded-[var(--radius-brand)] border border-[var(--color-hairline)] lg:hidden"
          >
            {open ? <X className="size-5" aria-hidden /> : <MenuIcon className="size-5" aria-hidden />}
          </button>
        </div>
      </div>

      {!orderingOpen ? (
        <p className="border-t border-[var(--color-hairline)] bg-[color-mix(in_srgb,var(--color-ink)_5%,transparent)] px-4 py-2 text-center text-xs text-[var(--color-muted-ink)]">
          Online ordering is paused right now — you can still browse the menu and book a table.
        </p>
      ) : null}

      {open ? (
        <nav id="mobile-nav" aria-label="Mobile" className="border-t border-[var(--color-hairline)] bg-[var(--color-surface)] lg:hidden">
          <ul className="container-page flex flex-col py-2">
            {navItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-[var(--radius-brand)] px-3 py-3 text-base font-medium hover:bg-[color-mix(in_srgb,var(--color-ink)_6%,transparent)]"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li>
              {customer?.signedIn ? (
                <Link
                  href={`/r/${restaurant.slug}/account`}
                  onClick={() => setOpen(false)}
                  className="block rounded-[var(--radius-brand)] px-3 py-3 text-base font-medium hover:bg-[color-mix(in_srgb,var(--color-ink)_6%,transparent)]"
                >
                  {customer.name ?? "Account"}
                </Link>
              ) : (
                <Link
                  href={`/r/${restaurant.slug}/account/sign-in`}
                  onClick={() => setOpen(false)}
                  className="block w-full rounded-[var(--radius-brand)] px-3 py-3 text-left text-base font-medium hover:bg-[color-mix(in_srgb,var(--color-ink)_6%,transparent)]"
                >
                  Sign In / Sign Up
                </Link>
              )}
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
