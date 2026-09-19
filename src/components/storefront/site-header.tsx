"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu as MenuIcon, Phone, ShoppingBag, X } from "lucide-react";
import type { WebsiteConfig } from "@/lib/contract/settings";
import { cn } from "@/lib/utils";

interface SiteHeaderProps {
  restaurant: { name: string; slug: string; logoUrl: string | null; phone: string | null };
  config: WebsiteConfig;
  itemCount: number;
  orderingOpen: boolean;
}

/** Navigation labels, order and links all come from websites.config.navigation. */
export function SiteHeader({ restaurant, config, itemCount, orderingOpen }: SiteHeaderProps) {
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

        <div className="flex items-center gap-2">
          {restaurant.phone ? (
            <a
              href={`tel:${restaurant.phone.replace(/\s+/g, "")}`}
              className="hidden items-center gap-2 rounded-[var(--radius-brand)] px-3 py-2 text-sm font-medium text-[var(--color-ink)] hover:bg-[color-mix(in_srgb,var(--color-ink)_6%,transparent)] sm:flex"
            >
              <Phone className="size-4" aria-hidden />
              <span className="hidden xl:inline">{restaurant.phone}</span>
            </a>
          ) : null}

          {config.navigation.showCart ? (
            <Link
              href={`/r/${restaurant.slug}/cart`}
              className="relative inline-flex h-11 items-center gap-2 rounded-[var(--radius-brand)] bg-[var(--color-brand)] px-4 text-sm font-medium text-[var(--color-brand-foreground)]"
            >
              <ShoppingBag className="size-4" aria-hidden />
              <span className="hidden sm:inline">{config.ordering.ctaLabel}</span>
              <span className="sr-only sm:hidden">Cart</span>
              <span
                aria-label={`${itemCount} item${itemCount === 1 ? "" : "s"} in cart`}
                className="grid min-w-6 place-items-center rounded-full bg-[var(--color-brand-foreground)] px-1.5 text-xs font-semibold text-[var(--color-brand)]"
              >
                {itemCount}
              </span>
            </Link>
          ) : null}

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
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
