"use client";

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
  Settings,
  Star,
  Ticket,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import { cn } from "@/shared/utils";
import { hasAnyPermission, type Permission } from "@/server/auth/permissions";

const NAV_ITEMS: { href: string; label: string; icon: typeof LayoutDashboard; permission?: Permission }[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/orders", label: "Orders", icon: ClipboardList, permission: "orders.view" },
  { href: "/admin/kitchen", label: "Kitchen", icon: ChefHat, permission: "kitchen.view" },
  { href: "/admin/menu", label: "Menu", icon: UtensilsCrossed, permission: "menu.view" },
  { href: "/admin/reservations", label: "Reservations", icon: CalendarCheck, permission: "reservations.view" },
  { href: "/admin/reviews", label: "Reviews", icon: Star, permission: "reviews.view" },
  { href: "/admin/customers", label: "Customers", icon: Users, permission: "customers.view" },
  { href: "/admin/coupons", label: "Coupons", icon: Ticket, permission: "coupons.view" },
  { href: "/admin/delivery-zones", label: "Delivery zones", icon: MapPinned, permission: "delivery.view" },
  { href: "/admin/locations", label: "Locations", icon: Building2, permission: "locations.view" },
  { href: "/admin/payments", label: "Payments", icon: CreditCard, permission: "payments.view" },
  { href: "/admin/settings", label: "Settings", icon: Settings, permission: "settings.view" },
];

export function AdminSidebar({ permissions }: { permissions: Permission[] }) {
  const pathname = usePathname();
  const items = NAV_ITEMS.filter((item) => !item.permission || hasAnyPermission(permissions, [item.permission]));

  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-[var(--color-hairline)] bg-[var(--color-surface)]">
      <div className="p-5">
        <span className="text-lg font-semibold">Admin</span>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {items.map((item) => {
          const active = item.href === "/admin" ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-[var(--radius-brand)] px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-[color-mix(in_srgb,var(--color-brand)_10%,transparent)] text-[var(--color-brand)]"
                  : "text-[var(--color-muted-ink)] hover:bg-[color-mix(in_srgb,var(--color-ink)_6%,transparent)] hover:text-[var(--color-ink)]",
              )}
            >
              <Icon className="size-4.5" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
