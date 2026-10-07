import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Admin branch access (2026-10-06 re-audit). DB-free: repositories are faked, so these pin the APP-level
 * rules — who sees which branch, who may change what. The database-level backstop (0029's write guard)
 * was verified against the hosted DB in a rolled-back transaction; tests/branch-isolation.test.ts covers
 * RLS on the disposable test database.
 */

const BRANCH_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BRANCH_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const RESTAURANT = "11111111-1111-4111-8111-111111111111";

const { repo } = vi.hoisted(() => ({
  repo: {
    members: [] as Record<string, unknown>[],
    locations: [] as unknown[],
    zones: [] as Record<string, unknown>[],
    writes: [] as { fn: string; args: unknown[] }[],
  },
}));

vi.mock("@/server/repositories/team", () => ({
  listTeamMembers: vi.fn(async () => repo.members),
  getTeamMember: vi.fn(async (_r: string, id: string) => repo.members.find((m) => m.id === id) ?? null),
  getTeamMemberByEmail: vi.fn(async (_r: string, email: string) => repo.members.find((m) => m.email === email) ?? null),
  createTeamMember: vi.fn(async (...args: unknown[]) => {
    repo.writes.push({ fn: "createTeamMember", args });
    return { id: "new", ...(args[1] as object) };
  }),
  attachTeamMemberToUser: vi.fn(),
  updateTeamMember: vi.fn(async (...args: unknown[]) => {
    repo.writes.push({ fn: "updateTeamMember", args });
    return { id: args[0], ...(args[1] as object) };
  }),
  setTeamMemberActive: vi.fn(async (...args: unknown[]) => repo.writes.push({ fn: "setTeamMemberActive", args })),
  deleteTeamMember: vi.fn(async (...args: unknown[]) => repo.writes.push({ fn: "deleteTeamMember", args })),
}));
vi.mock("@/server/repositories/restaurants", () => ({ listLocations: vi.fn(async () => repo.locations) }));
vi.mock("@/server/repositories/deliveries", () => ({
  listDeliveryZones: vi.fn(async () => repo.zones),
  getDeliveryZone: vi.fn(async (id: string) => repo.zones.find((z) => z.id === id) ?? null),
  createDeliveryZone: vi.fn(async (...args: unknown[]) => repo.writes.push({ fn: "createDeliveryZone", args })),
  updateDeliveryZone: vi.fn(async (...args: unknown[]) => repo.writes.push({ fn: "updateDeliveryZone", args })),
  deleteDeliveryZone: vi.fn(async (...args: unknown[]) => repo.writes.push({ fn: "deleteDeliveryZone", args })),
}));
vi.mock("@/server/repositories/menu", () => ({
  getMenuItem: vi.fn(async (_r: string, { id }: { id: string }) => (id === "item-1" ? { id } : null)),
  // the one-statement insert writes nothing unless the branch and item are this restaurant's
  setItemLocationAvailability: vi.fn(async (...args: unknown[]) => {
    const [, locationId, itemId] = args as string[];
    if (!(repo.locations as { id: string }[]).some((l) => l.id === locationId) || itemId !== "item-1") return false;
    repo.writes.push({ fn: "setItemLocationAvailability", args });
    return true;
  }),
}));
vi.mock("@/server/cache", () => ({ getStorefrontCache: () => ({ invalidate: () => undefined }) }));
vi.mock("@/server/auth/auth-service", () => ({ invalidateStaffActors: () => undefined }));
vi.mock("@/server/integrations/supabase-auth", () => ({ createSupabaseAuthUser: vi.fn(), supabaseAuthAdminAvailable: () => false }));

import {
  ALL_BRANCHES,
  assertRestaurantWide,
  canAccessBranch,
  canManageMember,
  resolveBranchScope,
} from "@/server/auth/branch-scope";
import { assignableRoles, can } from "@/server/auth/permissions";
import { branchFilter } from "@/server/db/mappers";
import { toApiError } from "@/server/errors";
import { addTeamMember, editTeamMember, removeTeamMember, setStaffActive } from "@/server/services/team";
import { setItemLocationAvailability } from "@/server/services/menu-admin";
import { removeDeliveryZone, saveDeliveryZone } from "@/server/services/delivery-zones";
import type { TeamRole } from "@/shared/contract/enums";
import type { RestaurantLocation } from "@/shared/contract/models";

const ctx = { restaurantId: RESTAURANT, userId: "u-actor", actor: "Actor" };
const actor = (role: TeamRole, locationId: string | null, userId = "u-actor") => ({ role, userId, member: { locationId } });
const owner = actor("owner", null);
const admin = actor("admin", null);
const managerA = actor("manager", BRANCH_A);
const staffA = actor("staff", BRANCH_A);

const location = (id: string, name: string, isPrimary = false) =>
  ({ id, restaurantId: RESTAURANT, name, slug: name.toLowerCase(), isPrimary, isActive: true }) as RestaurantLocation;
const LOCATIONS = [location(BRANCH_B, "Lahore", false), location(BRANCH_A, "Main", true)];

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "ok";
  } catch (error) {
    return toApiError(error).code;
  }
}

beforeEach(() => {
  repo.writes = [];
  repo.locations = LOCATIONS;
  repo.members = [
    { id: "m-owner", userId: "u-owner", role: "owner", locationId: null, email: "owner@x" },
    { id: "m-admin", userId: "u-admin", role: "admin", locationId: null, email: "admin@x" },
    { id: "m-mgr-b", userId: "u-mgr-b", role: "manager", locationId: BRANCH_B, email: "mb@x" },
    { id: "m-staff-a", userId: "u-staff-a", role: "staff", locationId: BRANCH_A, email: "sa@x" },
    { id: "m-staff-b", userId: "u-staff-b", role: "staff", locationId: BRANCH_B, email: "sb@x" },
    { id: "m-self", userId: "u-actor", role: "manager", locationId: BRANCH_A, email: "me@x" },
  ];
  repo.zones = [
    { id: "z-a", restaurantId: RESTAURANT, locationId: BRANCH_A },
    { id: "z-b", restaurantId: RESTAURANT, locationId: BRANCH_B },
  ];
});

describe("branch scope (the one source for every admin page)", () => {
  it("defaults owner/admin to the primary branch, deterministically", () => {
    expect(resolveBranchScope(owner, LOCATIONS, undefined).locationId).toBe(BRANCH_A);
    expect(resolveBranchScope(owner, LOCATIONS, "not-a-branch").locationId).toBe(BRANCH_A);
    expect(resolveBranchScope(owner, LOCATIONS, BRANCH_B).locationId).toBe(BRANCH_B);
    expect(resolveBranchScope(admin, LOCATIONS, ALL_BRANCHES)).toMatchObject({ locationId: null, current: null });
    expect(resolveBranchScope(owner, LOCATIONS, undefined).choices).toHaveLength(2);
  });

  it("pins branch staff to their own branch whatever the request asks for, with no selector", () => {
    for (const member of [managerA, staffA]) {
      for (const requested of [BRANCH_B, ALL_BRANCHES, undefined]) {
        const scope = resolveBranchScope(member, LOCATIONS, requested);
        expect(scope).toMatchObject({ locationId: BRANCH_A, locked: true, choices: [] });
      }
    }
  });

  it("does not filter a single-branch restaurant (orders placed with no branch keep showing)", () => {
    expect(resolveBranchScope(owner, [LOCATIONS[1]!], undefined)).toMatchObject({ locationId: null, choices: [] });
  });

  it("filters in SQL with the same rule as RLS: the branch plus rows tied to no branch", () => {
    expect(branchFilter("o", "$2")).toBe("($2::uuid is null or o.location_id is null or o.location_id = $2::uuid)");
    // a lost "$" once turned the filter into "branch = 3" (Postgres 42846 on the dashboard) — fail loudly instead
    expect(() => branchFilter("r", "3")).toThrow(/bind placeholder/);
  });

  it("keeps branch staff to their branch and shared data to owner/admin", () => {
    expect(canAccessBranch(managerA, BRANCH_A)).toBe(true);
    expect(canAccessBranch(managerA, BRANCH_B)).toBe(false);
    expect(canAccessBranch(owner, BRANCH_B)).toBe(true);
    expect(() => assertRestaurantWide(managerA)).toThrow();
    expect(() => assertRestaurantWide(admin)).not.toThrow();
  });
});

describe("role matrix", () => {
  it("gives Settings to owner/admin only and staff management to managers", () => {
    expect(can({ role: "manager" }, "settings.view")).toBe(false);
    expect(can({ role: "staff" }, "settings.view")).toBe(false);
    expect(can({ role: "admin" }, "settings.manage")).toBe(true);
    expect(can({ role: "manager" }, "staff.manage")).toBe(true);
    expect(can({ role: "staff" }, "staff.view")).toBe(false);
    expect(can({ role: "staff" }, "analytics.view")).toBe(false);
  });

  it("never lets anyone hand out a role above their own", () => {
    expect(assignableRoles("admin")).not.toContain("owner");
    expect(assignableRoles("manager")).toEqual(["staff"]);
    expect(assignableRoles("staff")).toEqual([]);
  });

  it("lets a manager manage only their own branch's staff, never HQ accounts or themselves", () => {
    const member = (role: TeamRole, locationId: string | null, userId = "other") => ({ role, locationId, userId });
    expect(canManageMember(managerA, member("staff", BRANCH_A))).toBe(true);
    expect(canManageMember(managerA, member("staff", BRANCH_B))).toBe(false);
    expect(canManageMember(managerA, member("manager", BRANCH_A))).toBe(false);
    expect(canManageMember(managerA, member("owner", null))).toBe(false);
    expect(canManageMember(admin, member("owner", null))).toBe(false);
    expect(canManageMember(owner, member("staff", BRANCH_B))).toBe(true);
    expect(canManageMember(owner, member("owner", null, "u-actor"))).toBe(false);
  });
});

describe("staff management (services/team.ts)", () => {
  const hire = (role: TeamRole, locationId?: string | null) => ({
    email: "new@x",
    fullName: "New",
    phone: "",
    role,
    locationId,
    password: "password1",
  });

  it("puts a manager's hire at the manager's branch and refuses any other branch or role", async () => {
    await addTeamMember(RESTAURANT, hire("staff"), ctx, managerA);
    expect((repo.writes[0]!.args[1] as { locationId: string }).locationId).toBe(BRANCH_A);
    expect(await code(addTeamMember(RESTAURANT, hire("staff", BRANCH_B), ctx, managerA))).toBe("FORBIDDEN");
    expect(await code(addTeamMember(RESTAURANT, hire("manager"), ctx, managerA))).toBe("FORBIDDEN");
    expect(await code(addTeamMember(RESTAURANT, hire("admin"), ctx, managerA))).toBe("FORBIDDEN");
  });

  it("lets owner/admin place staff at any of THIS restaurant's branches, and requires one", async () => {
    await addTeamMember(RESTAURANT, hire("manager", BRANCH_B), ctx, admin);
    expect((repo.writes[0]!.args[1] as { locationId: string }).locationId).toBe(BRANCH_B);
    expect(await code(addTeamMember(RESTAURANT, hire("staff"), ctx, admin))).toBe("VALIDATION_ERROR");
    expect(await code(addTeamMember(RESTAURANT, hire("staff", "99999999-9999-4999-8999-999999999999"), ctx, admin))).toBe("NOT_FOUND");
    expect(await code(addTeamMember(RESTAURANT, hire("owner"), ctx, admin))).toBe("FORBIDDEN");
  });

  it("makes owner/admin restaurant-wide even if a branch is sent", async () => {
    await addTeamMember(RESTAURANT, hire("admin", BRANCH_B), ctx, owner);
    expect((repo.writes[0]!.args[1] as { locationId: string | null }).locationId).toBeNull();
  });

  it("refuses an email already on the team instead of rewriting that member", async () => {
    expect(await code(addTeamMember(RESTAURANT, { ...hire("staff", BRANCH_A), email: "owner@x" }, ctx, owner))).toBe("CONFLICT");
  });

  it("blocks moving, promoting, disabling or removing across the line", async () => {
    const edit = (id: string, role: TeamRole, locationId?: string | null) => ({ id, fullName: "X", phone: "", role, locationId });
    expect(await code(editTeamMember(RESTAURANT, edit("m-staff-a", "staff", BRANCH_B), ctx, managerA))).toBe("FORBIDDEN");
    expect(await code(editTeamMember(RESTAURANT, edit("m-staff-a", "manager"), ctx, managerA))).toBe("FORBIDDEN");
    expect(await code(editTeamMember(RESTAURANT, edit("m-staff-b", "staff"), ctx, managerA))).toBe("FORBIDDEN");
    expect(await code(editTeamMember(RESTAURANT, edit("m-owner", "staff"), ctx, admin))).toBe("FORBIDDEN");
    expect(await code(setStaffActive(RESTAURANT, "m-staff-b", false, ctx, managerA))).toBe("FORBIDDEN");
    expect(await code(removeTeamMember(RESTAURANT, "m-mgr-b", ctx, managerA))).toBe("FORBIDDEN");
    expect(repo.writes).toEqual([]);
    expect(await code(setStaffActive(RESTAURANT, "m-staff-a", false, ctx, managerA))).toBe("ok");
  });

  it("a staff-role member can never add or change staff — even if an override granted staff.manage", async () => {
    // the role decides (assignableRoles("staff") is empty), not the permission list
    expect(await code(addTeamMember(RESTAURANT, hire("staff"), ctx, staffA))).toBe("FORBIDDEN");
    expect(await code(addTeamMember(RESTAURANT, hire("staff", BRANCH_A), ctx, staffA))).toBe("FORBIDDEN");
    const other = { id: "m-staff-a", fullName: "X", phone: "", role: "staff" as TeamRole };
    expect(await code(editTeamMember(RESTAURANT, other, ctx, { ...staffA, userId: "someone-else" }))).toBe("FORBIDDEN");
    expect(await code(setStaffActive(RESTAURANT, "m-staff-a", false, ctx, { ...staffA, userId: "someone-else" }))).toBe("FORBIDDEN");
    expect(await code(removeTeamMember(RESTAURANT, "m-staff-a", ctx, { ...staffA, userId: "someone-else" }))).toBe("FORBIDDEN");
    expect(repo.writes).toEqual([]);
  });

  it("lets you edit your own name but not your own role or branch", async () => {
    const self = { id: "m-self", fullName: "Me", phone: "", role: "manager" as TeamRole };
    expect(await code(editTeamMember(RESTAURANT, self, ctx, managerA))).toBe("ok");
    expect(repo.writes[0]!.args[1]).toEqual({ fullName: "Me", phone: null });
    expect(await code(editTeamMember(RESTAURANT, { ...self, role: "admin" }, ctx, managerA))).toBe("FORBIDDEN");
    expect(await code(editTeamMember(RESTAURANT, { ...self, locationId: BRANCH_B }, ctx, managerA))).toBe("FORBIDDEN");
  });
});

describe("branch data writes trust nothing from the browser", () => {
  it("menu availability: a manager switches items only at their own branch, of this restaurant", async () => {
    expect(await code(setItemLocationAvailability(RESTAURANT, BRANCH_A, "item-1", false, ctx, managerA))).toBe("ok");
    expect(await code(setItemLocationAvailability(RESTAURANT, BRANCH_B, "item-1", false, ctx, managerA))).toBe("FORBIDDEN");
    expect(await code(setItemLocationAvailability(RESTAURANT, BRANCH_B, "item-1", false, ctx, owner))).toBe("ok");
    expect(await code(setItemLocationAvailability(RESTAURANT, "99999999-9999-4999-8999-999999999999", "item-1", false, ctx, owner))).toBe("NOT_FOUND");
    expect(await code(setItemLocationAvailability(RESTAURANT, BRANCH_A, "someone-elses-item", false, ctx, owner))).toBe("NOT_FOUND");
  });

  it("delivery zones: the stored zone's branch is checked, not the request's", async () => {
    const zone = (id: string | undefined, locationId: string) =>
      ({ id, locationId, name: "Z", areas: [], postalCodes: [], deliveryFee: "0" }) as Parameters<typeof saveDeliveryZone>[1];
    expect(await code(saveDeliveryZone(RESTAURANT, zone("z-b", BRANCH_A), ctx, managerA))).toBe("FORBIDDEN");
    expect(await code(saveDeliveryZone(RESTAURANT, zone(undefined, BRANCH_B), ctx, managerA))).toBe("FORBIDDEN");
    expect(await code(removeDeliveryZone(RESTAURANT, "z-b", ctx, managerA))).toBe("FORBIDDEN");
    expect(await code(saveDeliveryZone(RESTAURANT, zone("z-a", BRANCH_A), ctx, managerA))).toBe("ok");
    expect(await code(removeDeliveryZone(RESTAURANT, "z-b", ctx, owner))).toBe("ok");
  });

  it("maps the database guard (0029, SQLSTATE RB403) to a FORBIDDEN, never a 500", () => {
    expect(toApiError(Object.assign(new Error("write outside the caller's branch"), { code: "RB403" })).code).toBe("FORBIDDEN");
  });
});

describe("static guarantees", () => {
  const adminDir = join(process.cwd(), "src/app/r/[restaurantSlug]/admin/(dashboard)");
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(name) ? [path] : [];
    });

  it("no admin page or route takes its branch from the URL (only the header's scope)", () => {
    for (const file of files(adminDir)) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/searchParams\.get\("location"\)|location\?: string/);
    }
  });

  it("guards every table the admin writes, in the migration", () => {
    const sql = readFileSync(join(process.cwd(), "db/migrations/0029_branch_write_guard.sql"), "utf8");
    for (const table of ["orders", "reservations", "reviews", "delivery_zones", "menu_item_location_overrides", "restaurant1s", "team_members", "menu_items", "coupons"]) {
      expect(sql).toContain(`array['${table}',`);
    }
    expect(sql).toMatch(/'team_members',\s+'location_id', 'strict'/);
  });

  it("status writes on the privileged role carry the restaurant + branch predicate", () => {
    for (const file of ["src/server/repositories/orders.ts", "src/server/repositories/reservations.ts", "src/server/repositories/reviews.ts"]) {
      expect(readFileSync(join(process.cwd(), file), "utf8"), file).toContain("app.can_access_location(restaurant_id, location_id)");
    }
  });
});
