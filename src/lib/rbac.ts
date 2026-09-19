import type { TeamRole } from "./contract/enums";

/**
 * Permission catalogue. This list is mirrored exactly by
 * app.role_permissions() in db/migrations/0002_enums.sql, and
 * tests/rbac.test.ts asserts the two stay in sync.
 */
export const PERMISSIONS = [
  "orders.view", "orders.manage", "orders.update_status", "kitchen.view",
  "menu.view", "menu.manage",
  "customers.view", "customers.manage",
  "reservations.view", "reservations.manage",
  "reviews.view", "reviews.manage",
  "delivery.view", "delivery.manage",
  "coupons.view", "coupons.manage",
  "media.view", "media.manage",
  "website.view", "website.manage",
  "staff.view", "staff.manage",
  "locations.view", "locations.manage",
  "payments.view",
  "analytics.view",
  "settings.view", "settings.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<TeamRole, readonly Permission[]> = {
  owner: PERMISSIONS,
  admin: [
    "orders.view", "orders.manage", "orders.update_status", "kitchen.view", "menu.view", "menu.manage",
    "customers.view", "customers.manage", "reservations.view", "reservations.manage", "reviews.view", "reviews.manage",
    "delivery.view", "delivery.manage", "coupons.view", "coupons.manage", "media.view", "media.manage",
    "website.view", "website.manage", "staff.view", "staff.manage", "locations.view", "locations.manage",
    "payments.view", "analytics.view", "settings.view", "settings.manage",
  ],
  manager: [
    "orders.view", "orders.manage", "orders.update_status", "kitchen.view", "menu.view", "menu.manage",
    "customers.view", "customers.manage", "reservations.view", "reservations.manage", "reviews.view", "reviews.manage",
    "delivery.view", "delivery.manage", "coupons.view", "coupons.manage", "media.view", "media.manage",
    "staff.view", "locations.view", "payments.view", "analytics.view", "settings.view",
  ],
  staff: [
    "orders.view", "orders.update_status", "kitchen.view", "menu.view", "customers.view",
    "reservations.view", "reservations.manage", "reviews.view", "delivery.view",
  ],
};

export const ROLE_LABELS: Record<TeamRole, string> = {
  owner: "Owner",
  admin: "Administrator",
  manager: "Manager",
  staff: "Staff",
};

export const ROLE_DESCRIPTIONS: Record<TeamRole, string> = {
  owner: "Full access including billing, staff and settings.",
  admin: "Everything except ownership transfer; can manage staff accounts.",
  manager: "Day-to-day operations: orders, menu, customers, coupons and reports.",
  staff: "Order taking, kitchen display and reservations.",
};

export interface PermissionOverrides {
  allow?: string[] | null;
  deny?: string[] | null;
}

/** Resolve effective permissions: role defaults, then allow/deny overrides. */
export function effectivePermissions(role: TeamRole, overrides?: PermissionOverrides | null): Permission[] {
  const base = new Set<string>(ROLE_PERMISSIONS[role] ?? []);
  const allow = Array.isArray(overrides?.allow) ? overrides.allow : [];
  const deny = Array.isArray(overrides?.deny) ? overrides.deny : [];
  for (const permission of allow) if (isPermission(permission)) base.add(permission);
  for (const permission of deny) base.delete(permission);
  return [...base] as Permission[];
}

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

export function can(
  actor: { role: TeamRole; permissions?: PermissionOverrides | null } | null | undefined,
  permission: Permission,
): boolean {
  if (!actor) return false;
  return effectivePermissions(actor.role, actor.permissions).includes(permission);
}

export function canAny(
  actor: { role: TeamRole; permissions?: PermissionOverrides | null } | null | undefined,
  permissions: Permission[],
): boolean {
  return permissions.some((permission) => can(actor, permission));
}

/** Navigation filtering helper used by the admin sidebar. */
export function hasAnyPermission(granted: Permission[], required: Permission[]): boolean {
  return required.some((permission) => granted.includes(permission));
}
