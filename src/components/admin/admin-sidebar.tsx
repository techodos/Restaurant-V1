"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  BarChart3,
  Building2,
  CalendarCheck,
  ChefHat,
  ChevronRight,
  ChevronsUpDown,
  ClipboardList,
  CreditCard,
  LayoutDashboard,
  Loader2,
  LogOut,
  MapPinned,
  Menu as MenuIcon,
  Settings,
  ShieldCheck,
  Star,
  Ticket,
  UserCog,
  Users,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { adminPath, cn } from "@/shared/utils";
import { ROLE_LABELS, hasAnyPermission, type Permission } from "@/server/auth/permissions";
import type { TeamRole } from "@/shared/contract/enums";
import { signOutAction } from "@/app/r/[restaurantSlug]/admin/(dashboard)/actions";
import { resetActivityCount, useOrderActivityCount } from "@/components/admin/order-sound-notifications";

/** Nav links that show live orders — arriving at one is as good as tapping the activity banner. */
const ORDER_ACTIVITY_HREFS = new Set(["", "/orders", "/kitchen"]);

/** `href` is relative to the restaurant's admin root (/r/<slug>/admin). */
type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; permission?: Permission };

/** Grouped by the job the screen serves; each link is still gated by the same permission as before. */
const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "Service",
    items: [
      { href: "", label: "Dashboard", icon: LayoutDashboard },
      { href: "/orders", label: "Orders", icon: ClipboardList, permission: "orders.view" },
      { href: "/kitchen", label: "Kitchen", icon: ChefHat, permission: "kitchen.view" },
      { href: "/reservations", label: "Reservations", icon: CalendarCheck, permission: "reservations.view" },
    ],
  },
  {
    title: "Catalogue",
    items: [
      { href: "/menu", label: "Menu", icon: UtensilsCrossed, permission: "menu.view" },
      { href: "/coupons", label: "Coupons", icon: Ticket, permission: "coupons.view" },
      { href: "/reviews", label: "Reviews", icon: Star, permission: "reviews.view" },
    ],
  },
  {
    title: "Business",
    items: [
      { href: "/customers", label: "Customers", icon: Users, permission: "customers.view" },
      { href: "/delivery-zones", label: "Delivery zones", icon: MapPinned, permission: "delivery.view" },
      { href: "/locations", label: "Locations", icon: Building2, permission: "locations.view" },
      { href: "/payments", label: "Payments", icon: CreditCard, permission: "payments.view" },
      { href: "/reports", label: "Sales reports", icon: BarChart3, permission: "analytics.view" },
      { href: "/staff", label: "Staff", icon: UserCog, permission: "staff.view" },
      { href: "/settings", label: "Settings", icon: Settings, permission: "settings.view" },
    ],
  },
];

function visibleGroups(permissions: Permission[]) {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.permission || hasAnyPermission(permissions, [item.permission])),
  })).filter((group) => group.items.length > 0);
}

function NavList({
  permissions,
  base,
  activeOrders = 0,
  onNavigate,
}: {
  permissions: Permission[];
  base: string;
  /** orders on the pass (pending → out for delivery) in the branch in scope; shown on the Orders link */
  activeOrders?: number;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const liveActivity = useOrderActivityCount();
  return (
    <nav aria-label="Admin" className="space-y-6">
      {visibleGroups(permissions).map((group) => (
        <div key={group.title}>
          <p className="px-3 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-[color-mix(in_srgb,var(--color-muted-ink)_80%,transparent)]">
            {group.title}
          </p>
          <ul className="mt-2 space-y-0.5">
            {group.items.map((item) => {
              const href = `${base}${item.href}`;
              const active = item.href === "" ? pathname === href : pathname.startsWith(href);
              const Icon = item.icon;
              const live = ORDER_ACTIVITY_HREFS.has(item.href) && liveActivity > 0 ? liveActivity : null;
              const count = live === null && item.href === "/orders" && activeOrders > 0 ? activeOrders : null;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => {
                      if (ORDER_ACTIVITY_HREFS.has(item.href)) resetActivityCount();
                      onNavigate?.();
                    }}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group relative flex items-center gap-3 rounded-[var(--radius-brand)] px-3 py-2 text-sm font-medium transition-colors duration-150",
                      active
                        ? "bg-[var(--tint-strong)] text-[var(--color-ink)] before:absolute before:inset-y-2 before:left-0 before:w-[2px] before:rounded-full before:bg-[var(--color-brand-accent)]"
                        : "text-[var(--color-muted-ink)] hover:bg-[var(--tint)] hover:text-[var(--color-ink)]",
                    )}
                  >
                    <Icon
                      className={cn("size-4 shrink-0", active ? "text-[var(--color-brand-accent)]" : "opacity-70 group-hover:opacity-100")}
                      aria-hidden
                    />
                    {item.label}
                    {live !== null ? (
                      <span className="tabular ml-auto animate-pulse rounded-full bg-[var(--color-danger)] px-2 py-px text-[11px] font-semibold text-white">
                        {live} new
                      </span>
                    ) : count !== null ? (
                      <span className="tabular ml-auto rounded-full bg-[var(--tint-strong)] px-2 py-px text-[11px] font-semibold text-[var(--color-ink)]">
                        {count}
                        <span className="sr-only"> active</span>
                      </span>
                    ) : null}
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
        <span className="block truncate font-[family-name:var(--font-heading)] text-[1.1rem] leading-tight">{restaurantName}</span>
        <span className="block text-xs text-[var(--color-muted-ink)]">Restaurant admin</span>
      </span>
    </div>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();

/**
 * The signed-in member at the foot of the sidebar: avatar, name, role, and a menu with the account actions that used
 * to sit in the header (Platform admin for a super admin, Sign out).
 */
function UserCard({ user, restaurantSlug }: { user: AdminNavUser; restaurantSlug: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  // inside .theme-root so the restaurant's tokens (fonts, colours) reach the portalled menu
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => setContainer(document.querySelector<HTMLElement>(".theme-root")), []);

  function signOut() {
    startTransition(() => {
      signOutAction(restaurantSlug).then(() => {
        router.push(adminPath(restaurantSlug, "/login"));
        router.refresh();
      });
    });
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className="flex w-full items-center gap-3 rounded-[var(--radius-card)] bg-[var(--tint)] p-2.5 text-left transition-colors hover:bg-[var(--tint-strong)] data-[state=open]:bg-[var(--tint-strong)]"
        aria-label={`Account: ${user.name}, ${ROLE_LABELS[user.role]}`}
      >
        <span
          aria-hidden
          className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--color-brand-accent)] text-xs font-semibold text-[var(--color-brand-accent-foreground)]"
        >
          {initials(user.name) || "?"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold leading-tight">{user.name}</span>
          <span className="block truncate text-xs text-[var(--color-muted-ink)]">{ROLE_LABELS[user.role]}</span>
        </span>
        {pending ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden /> : <ChevronsUpDown className="size-4 shrink-0 text-[var(--color-muted-ink)]" aria-hidden />}
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal container={container ?? undefined}>
        <DropdownMenu.Content
          side="top"
          align="start"
          sideOffset={6}
          className="animate-popover z-50 min-w-[var(--radix-dropdown-menu-trigger-width)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-hairline)] bg-[var(--color-surface)] p-1 text-[var(--color-ink)] shadow-[var(--shadow-raised)]"
        >
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-semibold">{user.name}</p>
            {user.email ? <p className="truncate text-xs text-[var(--color-muted-ink)]">{user.email}</p> : null}
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-[var(--color-hairline)]" />
          {user.role === "super_admin" ? (
            <DropdownMenu.Item asChild>
              <Link href="/super-admin" className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-brand)] px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-[var(--tint)]">
                <ShieldCheck className="size-4 text-[var(--color-muted-ink)]" aria-hidden /> Platform admin
              </Link>
            </DropdownMenu.Item>
          ) : null}
          <DropdownMenu.Item
            onSelect={signOut}
            disabled={pending}
            className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-brand)] px-2.5 py-2 text-sm text-[var(--color-danger)] outline-none data-[highlighted]:bg-[color-mix(in_srgb,var(--color-danger)_8%,transparent)]"
          >
            <LogOut className="size-4" aria-hidden /> Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export interface AdminNavUser {
  name: string;
  email?: string;
  role: TeamRole;
}

/** Desktop sidebar (lg and up). Phones and tablets use AdminMobileNav in the header instead. */
interface AdminNavProps {
  permissions: Permission[];
  restaurantName: string;
  restaurantSlug: string;
  user: AdminNavUser;
  activeOrders?: number;
}

export function AdminSidebar({ permissions, restaurantName, restaurantSlug, user, activeOrders }: AdminNavProps) {
  return (
    <aside className="tone-night sticky top-0 hidden h-dvh w-64 shrink-0 flex-col lg:flex">
      <div className="flex h-14 items-center border-b border-[var(--rule)] px-5">
        <Brand restaurantName={restaurantName} />
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-5">
        <NavList permissions={permissions} base={adminPath(restaurantSlug)} activeOrders={activeOrders} />
      </div>
      <div className="p-3">
        <UserCard user={user} restaurantSlug={restaurantSlug} />
      </div>
    </aside>
  );
}

/** Menu button + slide-over drawer for screens below lg. */
export function AdminMobileNav({ permissions, restaurantName, restaurantSlug, user, activeOrders }: AdminNavProps) {
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
        className="grid size-9 place-items-center rounded-[var(--radius-brand)] border border-[var(--rule-strong)] hover:bg-[var(--tint)]"
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
          <div className="tone-night animate-sheet absolute inset-y-0 left-0 flex w-[min(20rem,86vw)] flex-col shadow-[var(--shadow-raised)]">
            <div className="flex items-center justify-between border-b border-[var(--rule)] px-5 py-4">
              <Brand restaurantName={restaurantName} />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
                className="grid size-9 place-items-center rounded-full hover:bg-[var(--tint-strong)]"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-5">
              <NavList permissions={permissions} base={adminPath(restaurantSlug)} activeOrders={activeOrders} onNavigate={() => setOpen(false)} />
            </div>
            <div className="p-3">
              <UserCard user={user} restaurantSlug={restaurantSlug} />
            </div>
          </div>
        </div>,
        document.querySelector(".theme-root") ?? document.body,
      ) : null}
    </div>
  );
}

/** Deeper pages under a nav item, named for the breadcrumb (the last crumb). */
function subPageLabel(rest: string): string | null {
  if (!rest) return null;
  if (rest === "/items/new") return "New item";
  if (rest.startsWith("/items/")) return "Edit item";
  const segment = decodeURIComponent(rest.split("/").filter(Boolean)[0] ?? "");
  return segment || null;
}

/** "Group › Page" (› sub-page) for the header, from the same navigation the sidebar shows. */
export function AdminBreadcrumb({ restaurantSlug }: { restaurantSlug: string }) {
  const pathname = usePathname();
  const base = adminPath(restaurantSlug);
  let found: { group: string; item: NavItem; rest: string } | null = null;
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      const href = `${base}${item.href}`;
      const match = item.href === "" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
      if (match && (!found || item.href.length > found.item.href.length)) found = { group: group.title, item, rest: pathname.slice(href.length) };
    }
  }
  if (!found) return null;
  const sub = subPageLabel(found.rest);
  const crumbs: { label: string; href?: string }[] = [
    { label: found.group },
    { label: found.item.label, href: sub ? `${base}${found.item.href}` : undefined },
    ...(sub ? [{ label: sub }] : []),
  ];
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-[13px]">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${index}`} className={cn("flex min-w-0 items-center gap-1.5", index === 0 && "hidden sm:flex")}>
              {crumb.href ? (
                <Link href={crumb.href} className="truncate text-[var(--color-muted-ink)] transition-colors hover:text-[var(--color-ink)]">
                  {crumb.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={cn("truncate", last ? "font-semibold text-[var(--color-ink)]" : "text-[var(--color-muted-ink)]")}>
                  {crumb.label}
                </span>
              )}
              {!last ? <ChevronRight className="size-3.5 shrink-0 text-[var(--color-muted-ink)]" aria-hidden /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
