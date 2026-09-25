"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CalendarCheck,
  ChefHat,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  MapPinned,
  Menu as MenuIcon,
  Settings,
  Star,
  Ticket,
  Users,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { cn } from "@/shared/utils";
import { hasAnyPermission, type Permission } from "@/server/auth/permissions";

type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; permission?: Permission };

/** Grouped by the job the screen serves; each link is still gated by the same permission as before. */
const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Service",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
      { href: "/admin/orders", label: "Orders", icon: ClipboardList, permission: "orders.view" },
      { href: "/admin/kitchen", label: "Kitchen", icon: ChefHat, permission: "kitchen.view" },
      { href: "/admin/reservations", label: "Reservations", icon: CalendarCheck, permission: "reservations.view" },
    ],
  },
  {
    title: "Catalogue",
    items: [
      { href: "/admin/menu", label: "Menu", icon: UtensilsCrossed, permission: "menu.view" },
      { href: "/admin/coupons", label: "Coupons", icon: Ticket, permission: "coupons.view" },
      { href: "/admin/reviews", label: "Reviews", icon: Star, permission: "reviews.view" },
    ],
  },
  {
    title: "Business",
    items: [
      { href: "/admin/customers", label: "Customers", icon: Users, permission: "customers.view" },
      { href: "/admin/delivery-zones", label: "Delivery zones", icon: MapPinned, permission: "delivery.view" },
      { href: "/admin/locations", label: "Locations", icon: Building2, permission: "locations.view" },
      { href: "/admin/payments", label: "Payments", icon: CreditCard, permission: "payments.view" },
      { href: "/admin/settings", label: "Settings", icon: Settings, permission: "settings.view" },
    ],
  },
];

function visibleGroups(permissions: Permission[]) {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.permission || hasAnyPermission(permissions, [item.permission])),
  })).filter((group) => group.items.length > 0);
}

function NavList({ permissions, onNavigate }: { permissions: Permission[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Admin" className="space-y-6">
      {visibleGroups(permissions).map((group) => (
        <div key={group.title}>
          <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--color-muted-ink)]">
            {group.title}
          </p>
          <ul className="mt-2 space-y-0.5">
            {group.items.map((item) => {
              const active = item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-3 rounded-[var(--radius-brand)] px-3 py-2 text-sm font-medium transition-colors duration-150",
                      active
                        ? "bg-[var(--color-ink)] text-[var(--color-surface)]"
                        : "text-[color-mix(in_srgb,var(--color-ink)_72%,transparent)] hover:bg-[color-mix(in_srgb,var(--color-ink)_5%,transparent)] hover:text-[var(--color-ink)]",
                    )}
                  >
                    <Icon
                      className={cn("size-4 shrink-0", active ? "opacity-100" : "opacity-70 group-hover:opacity-100")}
                      aria-hidden
                    />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand({ restaurantName }: { restaurantName: string }) {
  return (
    <div className="flex items-center gap-3">
      <span
        aria-hidden
        className="grid size-9 shrink-0 place-items-center rounded-[var(--radius-brand)] bg-[var(--color-brand)] text-sm font-bold text-[var(--color-brand-foreground)]"
      >
        {restaurantName.slice(0, 1)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold leading-tight">{restaurantName}</span>
        <span className="block text-xs text-[var(--color-muted-ink)]">Restaurant admin</span>
      </span>
    </div>
  );
}

/** Desktop sidebar (lg and up). Phones and tablets use AdminMobileNav in the header instead. */
export function AdminSidebar({ permissions, restaurantName }: { permissions: Permission[]; restaurantName: string }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-[var(--color-hairline)] bg-[var(--color-surface)] lg:flex">
      <div className="border-b border-[var(--color-hairline)] px-5 py-5">
        <Brand restaurantName={restaurantName} />
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-5">
        <NavList permissions={permissions} />
      </div>
    </aside>
  );
}

/** Menu button + slide-over drawer for screens below lg. */
export function AdminMobileNav({ permissions, restaurantName }: { permissions: Permission[]; restaurantName: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        aria-expanded={open}
        className="grid size-10 place-items-center rounded-[var(--radius-brand)] border border-[var(--color-hairline)] bg-[var(--color-surface)]"
      >
        <MenuIcon className="size-5" aria-hidden />
      </button>

      {/* portalled: the sticky header's backdrop-filter would otherwise trap position:fixed inside it */}
      {open && typeof document !== "undefined" ? createPortal(
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Navigation">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-[color-mix(in_srgb,var(--color-ink)_45%,transparent)] backdrop-blur-sm"
          />
          <div className="animate-sheet absolute inset-y-0 left-0 flex w-[min(20rem,86vw)] flex-col bg-[var(--color-surface)] shadow-[var(--shadow-raised)]">
            <div className="flex items-center justify-between border-b border-[var(--color-hairline)] px-5 py-4">
              <Brand restaurantName={restaurantName} />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
                className="grid size-9 place-items-center rounded-full hover:bg-[color-mix(in_srgb,var(--color-ink)_6%,transparent)]"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-5">
              <NavList permissions={permissions} onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>,
        document.querySelector(".theme-root") ?? document.body,
      ) : null}
    </div>
  );
}
