"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { ArrowRight, ClipboardList, Phone, ShoppingBag, UserRound, type LucideIcon } from "lucide-react";
import type { WebsiteConfig } from "@/shared/contract/settings";
import { cn } from "@/shared/utils";
import { Sheet } from "@/components/motion/sheet";
import { TrayCount } from "./tray-count";

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

/**
 * A header action that is an icon at rest and slides its label open on hover or keyboard focus (hover only
 * on real pointers; phones keep the icon). `badge` sits on the icon's corner (the cart count).
 */
function HeaderIconLink({
  href,
  label,
  icon: Icon,
  badge,
  className,
  ...rest
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: React.ReactNode;
} & Omit<React.ComponentProps<typeof Link>, "href" | "children">) {
  return (
    <Link
      href={href}
      className={cn(
        "group/action press flex h-10 items-center rounded-[var(--radius-control)] border border-transparent px-2.5 text-[var(--color-ink)] transition-[background-color,border-color] duration-300 hover:border-[var(--rule-strong)] hover:bg-[var(--tint)] focus-visible:border-[var(--rule-strong)] focus-visible:bg-[var(--tint)]",
        className,
      )}
      {...rest}
    >
      <span className="relative grid size-5 place-items-center">
        <Icon className="size-[19px]" aria-hidden />
        {badge}
      </span>
      <span
        aria-hidden
        className="max-w-0 overflow-hidden whitespace-nowrap text-[13px] font-semibold opacity-0 transition-[max-width,opacity,margin] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover/action:ml-2.5 group-hover/action:max-w-24 group-hover/action:opacity-100 group-focus-visible/action:ml-2.5 group-focus-visible/action:max-w-24 group-focus-visible/action:opacity-100"
      >
        {label}
      </span>
    </Link>
  );
}

/** Pages whose first section is a full-bleed hero mark it with this attribute; the header then floats over it. */
const HERO_SELECTOR = "main [data-hero-overlay]";

/**
 * The header's ground comes from the database: websites.config.navigation.tone ("dark" = the theme's
 * night surface, the default; "light" = the theme's background). Over a page that opens with a full-bleed
 * hero it starts transparent with light type (the photograph shows through) and settles into its
 * configured ground once the page scrolls.
 * Navigation labels, order and links come from websites.config.navigation (only `enabled` items). The
 * action on the right is the account pill: "Sign In / Sign Up", or the customer's initial and name once
 * signed in (the menu itself is in the navigation, so there is no separate order button).
 */
export function SiteHeader({ restaurant, config, itemCount, orderingOpen, customer }: SiteHeaderProps) {
  const [open, setOpen] = useState(false);
  const [overHero, setOverHero] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const navItems = config.navigation.items.filter((item) => item.enabled);
  const announcement = config.announcement;
  const home = `/r/${restaurant.slug}`;
  const accountHref = customer?.signedIn ? `${home}/account` : `${home}/account/sign-in`;
  const accountLabel = customer?.signedIn ? (customer.name ?? "Account") : "Sign In / Sign Up";
  const headerRef = useRef<HTMLElement>(null);

  // a navigation (link click, back button) always closes the menu
  useEffect(() => setOpen(false), [pathname]);

  // Is there a hero under us on this page? Re-checked on every navigation.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setOverHero(Boolean(document.querySelector(HERO_SELECTOR))));
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Publish the header's height (it grows with the announcement bar / paused notice) so heroes can slide
  // under it and sticky sub-navigation and anchor offsets sit right below it.
  useEffect(() => {
    const element = headerRef.current;
    if (!element) return;
    const publish = () => document.documentElement.style.setProperty("--header-h", `${Math.round(element.offsetHeight)}px`);
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(element);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--header-h");
    };
  }, []);

  const transparent = overHero && !scrolled;
  const light = config.navigation.tone === "light";
  // over a photo the type must be light whatever the setting; otherwise the configured ground
  const tone = transparent || !light ? "night" : "paper";

  return (
    <>
      <header
        ref={headerRef}
        data-transparent={transparent || undefined}
        className={cn(
          `tone-${tone}`,
          "z-40 w-full transition-[background-color,border-color,box-shadow] duration-500",
          config.navigation.sticky ? "sticky top-0" : "relative",
          transparent
            ? "border-b border-transparent bg-[linear-gradient(180deg,rgb(0_0_0/0.62)_0%,rgb(0_0_0/0.28)_65%,transparent_100%)]"
            : light
              ? "border-b border-[var(--rule)] bg-[color-mix(in_srgb,var(--color-canvas)_90%,transparent)] shadow-[0_10px_30px_-26px_rgb(0_0_0/0.35)] backdrop-blur-xl"
              : "border-b border-[var(--rule)] shadow-[0_10px_30px_-24px_rgb(0_0_0/0.6)]",
        )}
      >
        {announcement.enabled && announcement.text ? (
          <div className={cn("border-b border-[var(--rule)] px-4 py-2 text-center text-[12.5px] leading-snug text-[var(--color-muted-ink)]", tone === "night" ? "bg-[color-mix(in_srgb,var(--color-night)_80%,black)]" : "bg-[var(--steel-1)]")}>
            <span>{announcement.text}</span>
            {announcement.linkHref && announcement.linkLabel ? (
              <Link href={announcement.linkHref} className="group ml-2 inline-flex items-center gap-1 font-semibold text-[var(--color-ink)]">
                {announcement.linkLabel}
                <ArrowRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
              </Link>
            ) : null}
          </div>
        ) : null}

        <div className="container-page grid h-[4.25rem] grid-cols-[1fr_auto] items-center gap-4 lg:h-20 lg:grid-cols-[1fr_auto_1fr]">
          <Link href={home} className="flex min-w-0 items-center gap-3 justify-self-start" aria-label={`${restaurant.name} home`}>
            {restaurant.logoUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element -- DB-provided logo, dimensions unknown */}
                <img src={restaurant.logoUrl} alt="" className="h-9 w-auto lg:h-10" />
                <span className="sr-only">{restaurant.name}</span>
              </>
            ) : (
              <span className="truncate font-[family-name:var(--font-display)] text-[1.35rem] leading-none tracking-[0.01em] lg:text-[1.55rem]">
                {restaurant.name}
              </span>
            )}
          </Link>

          <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
            {navItems.map((item) => {
              const active = isActive(pathname, item.href, home);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative px-3.5 py-2 text-[13.5px] font-medium tracking-[0.01em] transition-colors duration-200",
                    active ? "text-[var(--color-ink)]" : "text-[var(--color-muted-ink)] hover:text-[var(--color-ink)]",
                  )}
                >
                  {item.label}
                  {active ? (
                    <motion.span
                      layoutId="nav-mark"
                      className="absolute inset-x-3.5 -bottom-0.5 h-px bg-[var(--color-brand-accent)]"
                      transition={{ type: "spring", duration: 0.4, bounce: 0.12 }}
                    />
                  ) : null}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-1.5 justify-self-end sm:gap-2">
            {customer?.signedIn ? (
              <HeaderIconLink
                href={`${home}/orders`}
                label="My orders"
                icon={ClipboardList}
                aria-label="My orders"
                aria-current={isActive(pathname, `${home}/orders`, home) ? "page" : undefined}
                className="hidden sm:flex"
              />
            ) : null}

            {config.navigation.showCart ? (
              <HeaderIconLink
                href={`${home}/cart`}
                label="Cart"
                icon={ShoppingBag}
                data-tray-target
                aria-label={`Cart, ${itemCount} item${itemCount === 1 ? "" : "s"}`}
                badge={
                  <span
                    className={cn(
                      "absolute -right-2 -top-2 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-bold transition-[opacity,transform] duration-200",
                      itemCount > 0
                        ? "bg-[var(--color-brand-accent)] text-[var(--color-brand-accent-foreground)]"
                        : "scale-75 opacity-0",
                    )}
                  >
                    <TrayCount count={itemCount} />
                  </span>
                }
              />
            ) : null}

            <Link
              href={accountHref}
              title={accountLabel}
              className="press hidden h-10 items-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-brand)] pl-1.5 pr-4 text-[13px] font-semibold text-[var(--color-brand-foreground)] transition-[background-color,box-shadow] duration-200 hover:bg-[color-mix(in_srgb,var(--color-brand)_86%,black)] hover:shadow-[var(--shadow-brand)] sm:flex"
            >
              <span aria-hidden className="grid size-7 place-items-center rounded-full bg-[color-mix(in_srgb,var(--color-brand-foreground)_18%,transparent)]">
                {customer?.signedIn && customer.name ? (
                  <span className="text-[11px] font-bold uppercase">{customer.name.slice(0, 1)}</span>
                ) : (
                  <UserRound className="size-4" />
                )}
              </span>
              <span className="max-w-32 truncate">{accountLabel}</span>
            </Link>

            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-expanded={open}
              aria-label="Open menu"
              className="press grid size-10 place-items-center rounded-full text-[var(--color-ink)] transition-colors hover:bg-[var(--tint-strong)] lg:hidden"
            >
              <span aria-hidden className="relative block h-2.5 w-5">
                <span className="absolute left-0 top-0 h-[1.5px] w-full rounded-full bg-current" />
                <span className="absolute bottom-0 right-0 h-[1.5px] w-3/5 rounded-full bg-current" />
              </span>
            </button>
          </div>
        </div>

        {!orderingOpen ? (
          <p className="border-t border-[var(--rule)] px-4 py-2 text-center text-xs text-[var(--color-muted-ink)]">
            Online ordering is paused right now. You can still browse the menu and book a table.
          </p>
        ) : null}
      </header>

      <Sheet open={open} onOpenChange={setOpen} title={restaurant.name} tone={light ? "paper" : "night"}>
        <nav aria-label="Mobile" className="flex min-h-full flex-col px-5 pb-8 md:px-7">
          <ul>
            {navItems.map((item, index) => {
              const active = isActive(pathname, item.href, home);
              return (
                <li key={item.href} className="stagger-in" style={{ "--i": index } as React.CSSProperties}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className="group flex items-center justify-between border-b border-[var(--rule)] py-4 font-[family-name:var(--font-display)] text-[1.85rem] leading-tight"
                  >
                    <span className={active ? (light ? "text-[var(--color-brand)]" : "text-[var(--color-brand-accent)]") : undefined}>{item.label}</span>
                    <ArrowRight
                      className="size-5 text-[var(--color-muted-ink)] transition-transform duration-200 group-hover:translate-x-1"
                      aria-hidden
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-8 grid gap-3">
            {customer?.signedIn ? (
              <Link
                href={`${home}/orders`}
                onClick={() => setOpen(false)}
                className="press flex h-12 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-[var(--rule-strong)] text-sm font-semibold"
              >
                <ClipboardList className="size-4" aria-hidden />
                My orders
              </Link>
            ) : null}
            <Link
              href={accountHref}
              onClick={() => setOpen(false)}
              className="press flex h-12 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--color-brand)] text-sm font-semibold text-[var(--color-brand-foreground)]"
            >
              <UserRound className="size-4" aria-hidden />
              <span className="max-w-60 truncate">{accountLabel}</span>
            </Link>
            {restaurant.phone ? (
              <a
                href={`tel:${restaurant.phone.replace(/\s+/g, "")}`}
                className="press flex h-12 items-center justify-center gap-2 text-sm font-medium text-[var(--color-muted-ink)]"
              >
                <Phone className="size-4" aria-hidden />
                {restaurant.phone}
              </a>
            ) : null}
          </div>
        </nav>
      </Sheet>
    </>
  );
}
