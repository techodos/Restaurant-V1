"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, ShoppingBag, User } from "lucide-react";
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

/** A nav link is active on its own page and on its sub-pages (menu -> menu/<item>), home only on itself. */
function isActive(pathname: string, href: string, home: string): boolean {
  if (href === home) return pathname === home;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Navigation labels, order and links all come from websites.config.navigation. */
export function SiteHeader({ restaurant, config, itemCount, orderingOpen, customer }: SiteHeaderProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const navItems = config.navigation.items.filter((item) => item.enabled);
  const announcement = config.announcement;
  const home = `/r/${restaurant.slug}`;
  const accountHref = customer?.signedIn ? `${home}/account` : `${home}/account/sign-in`;
  const accountLabel = customer?.signedIn ? (customer.name ?? "Account") : "Sign In / Sign Up";

  const headerRef = useRef<HTMLElement>(null);

  // a navigation (link click, back button) always closes the mobile sheet
  useEffect(() => setOpen(false), [pathname]);

  // Publish the sticky header's real height (it grows with the announcement bar / paused notice) so
  // sticky sub-navigation and anchor offsets sit right under it. The open mobile sheet is excluded.
  useEffect(() => {
    const element = headerRef.current;
    if (!element || !config.navigation.sticky) return;
    const publish = () => {
      const sheet = element.querySelector<HTMLElement>("#mobile-nav");
      const height = element.offsetHeight - (sheet?.offsetHeight ?? 0);
      document.documentElement.style.setProperty("--header-h", `${Math.round(height)}px`);
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(element);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--header-h");
    };
  }, [config.navigation.sticky]);

  return (
    <header
      ref={headerRef}
      className={cn(
        "z-40 w-full border-b border-[color-mix(in_srgb,var(--color-hairline)_80%,transparent)] bg-[color-mix(in_srgb,var(--color-surface)_82%,transparent)] backdrop-blur-xl backdrop-saturate-150",
        config.navigation.sticky && "sticky top-0",
      )}
    >
      {announcement.enabled && announcement.text ? (
        <div className="bg-[var(--color-brand)] px-4 py-2 text-center text-[13px] leading-snug text-[var(--color-brand-foreground)]">
          <span>{announcement.text}</span>
          {announcement.linkHref && announcement.linkLabel ? (
            <Link
              href={announcement.linkHref}
              className="group ml-2 inline-flex items-center gap-1 font-semibold underline decoration-white/40 underline-offset-4 hover:decoration-current"
            >
              {announcement.linkLabel}
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="container-page flex h-16 items-center justify-between gap-4 md:h-[72px]">
        <Link href={home} className="flex min-w-0 items-center gap-3" aria-label={`${restaurant.name} home`}>
          {restaurant.logoUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- DB-provided logo, dimensions unknown */}
              <img src={restaurant.logoUrl} alt="" className="h-9 w-auto md:h-10" />
              <span className="sr-only">{restaurant.name}</span>
            </>
          ) : (
            <>
              <span
                aria-hidden
                className="grid size-10 place-items-center rounded-[var(--radius-brand)] bg-[var(--color-brand)] font-semibold text-[var(--color-brand-foreground)]"
              >
                {restaurant.name.slice(0, 1)}
              </span>
              <span className="truncate font-[family-name:var(--font-display)] text-lg font-semibold tracking-[-0.02em] md:text-xl">
                {restaurant.name}
              </span>
            </>
          )}
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-0.5 lg:flex">
          {navItems.map((item) => {
            const active = isActive(pathname, item.href, home);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative rounded-full px-3.5 py-2 text-sm font-medium transition-colors duration-200",
                  active
                    ? "bg-[color-mix(in_srgb,var(--color-brand)_10%,transparent)] text-[var(--color-brand)]"
                    : "text-[color-mix(in_srgb,var(--color-ink)_78%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-ink)_5%,transparent)] hover:text-[var(--color-ink)]",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-2">
          {config.navigation.showCart ? (
            <Link
              href={`${home}/cart`}
              aria-label={`Cart, ${itemCount} item${itemCount === 1 ? "" : "s"}`}
              className="relative grid size-11 place-items-center rounded-full border border-[var(--color-hairline)] bg-[var(--color-surface)] text-[var(--color-ink)] transition-[border-color,transform] duration-200 hover:border-[color-mix(in_srgb,var(--color-ink)_30%,var(--color-hairline))] active:scale-95"
            >
              <ShoppingBag className="size-[18px]" aria-hidden />
              {itemCount > 0 ? (
                <span
                  aria-hidden
                  className="tabular absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[var(--color-brand)] px-1 text-[11px] font-bold leading-none text-[var(--color-brand-foreground)] ring-2 ring-[var(--color-surface)]"
                >
                  {itemCount > 99 ? "99+" : itemCount}
                </span>
              ) : null}
            </Link>
          ) : null}

          <Link
            href={accountHref}
            className="hidden h-11 items-center gap-2 rounded-full bg-[var(--color-brand)] pl-1.5 pr-4 text-sm font-semibold text-[var(--color-brand-foreground)] shadow-[var(--shadow-brand)] transition-[filter,transform] duration-200 hover:brightness-110 active:scale-[0.98] sm:flex"
          >
            <span className="grid size-8 place-items-center rounded-full bg-white/18">
              {customer?.signedIn && customer.name ? (
                <span className="text-xs font-bold uppercase">{customer.name.slice(0, 1)}</span>
              ) : (
                <User className="size-4" aria-hidden />
              )}
            </span>
            <span className="max-w-32 truncate">{accountLabel}</span>
          </Link>

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            className="relative grid size-11 place-items-center rounded-full border border-[var(--color-hairline)] bg-[var(--color-surface)] lg:hidden"
          >
            <span aria-hidden className="relative block h-3 w-[18px]">
              <span
                className={cn(
                  "absolute left-0 top-0 h-[1.5px] w-full rounded-full bg-current transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                  open && "translate-y-[5.25px] rotate-45",
                )}
              />
              <span
                className={cn(
                  "absolute bottom-0 left-0 h-[1.5px] w-full rounded-full bg-current transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                  open && "-translate-y-[5.25px] -rotate-45",
                )}
              />
            </span>
          </button>
        </div>
      </div>

      {!orderingOpen ? (
        <p className="border-t border-[var(--color-hairline)] bg-[color-mix(in_srgb,var(--color-ink)_4%,transparent)] px-4 py-2 text-center text-xs text-[var(--color-muted-ink)]">
          Online ordering is paused right now. You can still browse the menu and book a table.
        </p>
      ) : null}

      {open ? (
        <nav
          id="mobile-nav"
          aria-label="Mobile"
          className="animate-sheet max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-[var(--color-hairline)] bg-[var(--color-surface)] lg:hidden"
        >
          <ul className="container-page flex flex-col py-3">
            {navItems.map((item, index) => {
              const active = isActive(pathname, item.href, home);
              return (
                <li key={item.href} className="stagger-in" style={{ "--i": index } as React.CSSProperties}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex items-center justify-between border-b border-[var(--color-hairline)] py-4 font-[family-name:var(--font-display)] text-2xl tracking-[-0.02em]",
                      active ? "text-[var(--color-brand)]" : "text-[var(--color-ink)]",
                    )}
                  >
                    {item.label}
                    <ArrowRight className="size-5 text-[var(--color-muted-ink)]" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
          <div
            className="container-page stagger-in grid gap-3 pb-6 pt-2 sm:grid-cols-2"
            style={{ "--i": navItems.length } as React.CSSProperties}
          >
            <Link
              href={accountHref}
              className="flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--color-brand)] text-sm font-semibold text-[var(--color-brand-foreground)]"
            >
              <User className="size-4" aria-hidden />
              <span className="max-w-48 truncate">{accountLabel}</span>
            </Link>
            {restaurant.phone ? (
              <a
                href={`tel:${restaurant.phone.replace(/\s+/g, "")}`}
                className="flex h-12 items-center justify-center rounded-full border border-[var(--color-hairline)] text-sm font-semibold"
              >
                Call {restaurant.phone}
              </a>
            ) : null}
          </div>
        </nav>
      ) : null}
    </header>
  );
}
