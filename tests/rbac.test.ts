import { afterAll, describe, expect, it } from "vitest";
import { PERMISSIONS, ROLE_PERMISSIONS, can, effectivePermissions } from "../src/lib/rbac";
import { TEAM_ROLES, type TeamRole } from "../src/lib/contract/enums";
import { testDatabase } from "./helpers/db";

afterAll(async () => {
  await testDatabase.end();
});

describe("RBAC catalogue", () => {
  it("keeps the TypeScript role matrix in sync with app.role_permissions()", async () => {
    for (const role of TEAM_ROLES) {
      const rows = await testDatabase.read({}, (db) =>
        db.query<{ permissions: string[] }>("select app.role_permissions($1::team_role) as permissions", [role]),
      );
      const sqlPermissions = [...(rows[0]?.permissions ?? [])].sort();
      const tsPermissions = [...ROLE_PERMISSIONS[role]].sort();
      expect(sqlPermissions, `role ${role} differs between SQL and TypeScript`).toEqual(tsPermissions);
    }
  });

  it("only lists known permissions in the catalogue", () => {
    const known = new Set<string>(PERMISSIONS);
    for (const role of TEAM_ROLES) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        expect(known.has(permission)).toBe(true);
      }
    }
  });

  it("gives owners every permission and keeps staff limited", () => {
    expect([...ROLE_PERMISSIONS.owner].sort()).toEqual([...PERMISSIONS].sort());
    expect(can({ role: "staff" }, "orders.update_status")).toBe(true);
    expect(can({ role: "staff" }, "menu.manage")).toBe(false);
    expect(can({ role: "staff" }, "staff.manage")).toBe(false);
    expect(can({ role: "manager" }, "menu.manage")).toBe(true);
    expect(can({ role: "manager" }, "staff.manage")).toBe(false);
    expect(can({ role: "admin" }, "staff.manage")).toBe(true);
  });

  it("honours allow/deny overrides on a team member record", () => {
    const granted = effectivePermissions("staff", { allow: ["menu.manage"] });
    expect(granted).toContain("menu.manage");

    const revoked = effectivePermissions("owner", { deny: ["settings.manage"] });
    expect(revoked).not.toContain("settings.manage");
    expect(revoked).toContain("orders.manage");
    expect(can({ role: "owner", permissions: { deny: ["settings.manage"] } }, "settings.manage")).toBe(false);
  });

  it("is closed by default for unknown actors", () => {
    expect(can(null, "orders.view")).toBe(false);
    expect(effectivePermissions("staff", { allow: ["not.a.permission"] })).not.toContain("not.a.permission" as never);
  });
});

describe("permission enforcement in the database", () => {
  const restaurantId = "11111111-1111-4111-8111-111111111111";
  const ownerId = "22222222-2222-4222-8222-222222220001";
  const chefId = "22222222-2222-4222-8222-222222220004";

  it("reports the correct role for each member", async () => {
    const [ownerRole, chefRole] = await Promise.all([
      testDatabase.read({ userId: ownerId }, (db) =>
        db.queryOne<{ role: TeamRole }>("select app.team_role($1) as role", [restaurantId]),
      ),
      testDatabase.read({ userId: chefId }, (db) =>
        db.queryOne<{ role: TeamRole }>("select app.team_role($1) as role", [restaurantId]),
      ),
    ]);
    expect(ownerRole?.role).toBe("owner");
    expect(chefRole?.role).toBe("staff");
  });

  it("allows owners to manage settings but blocks kitchen staff", async () => {
    const owner = await testDatabase.read({ userId: ownerId }, (db) =>
      db.queryOne<{ allowed: boolean }>("select app.has_permission($1, 'settings.manage') as allowed", [restaurantId]),
    );
    const chef = await testDatabase.read({ userId: chefId }, (db) =>
      db.queryOne<{ allowed: boolean }>("select app.has_permission($1, 'settings.manage') as allowed", [restaurantId]),
    );
    expect(owner?.allowed).toBe(true);
    expect(chef?.allowed).toBe(false);
  });
});
