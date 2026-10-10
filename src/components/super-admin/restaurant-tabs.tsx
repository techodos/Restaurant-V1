"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink, Globe, SlidersHorizontal } from "lucide-react";
import { cn } from "@/shared/utils";

/** Underlined section tabs for one restaurant; scrolls sideways on narrow screens instead of wrapping. */
export function RestaurantTabs({ slug, adminHref }: { slug: string; adminHref: string }) {
  const pathname = usePathname();
  const base = `/super-admin/${slug}`;
  const tabs = [
    { href: base, label: "Features & menus", icon: SlidersHorizontal, active: pathname === base },
    { href: `${base}/website`, label: "Website & pages", icon: Globe, active: pathname.startsWith(`${base}/website`) },
  ];
  return (
    <nav aria-label="Restaurant sections" className="scrollbar-none -mx-4 overflow-x-auto border-b border-[var(--color-hairline)] px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max items-center gap-1">
        {tabs.map(({ href, label, icon: Icon, active }) => (
          <li key={href}>
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex h-11 items-center gap-2 px-3 text-sm font-medium transition-colors",
                "after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:transition-colors",
                active
                  ? "text-[var(--color-ink)] after:bg-[var(--color-brand)]"
                  : "text-[var(--color-muted-ink)] after:bg-transparent hover:text-[var(--color-ink)]",
              )}
            >
              <Icon className={cn("size-4", active ? "text-[var(--color-brand)]" : "text-[var(--sa-faint-ink)]")} aria-hidden />
              {label}
            </Link>
          </li>
        ))}
        <li className="ml-auto pl-4">
          <Link
            href={adminHref}
            className="flex h-11 items-center gap-1.5 px-2 text-[13px] font-medium text-[var(--color-muted-ink)] transition-colors hover:text-[var(--color-brand)]"
          >
            Open admin <ExternalLink className="size-3.5" aria-hidden />
          </Link>
        </li>
      </ul>
    </nav>
  );
}
