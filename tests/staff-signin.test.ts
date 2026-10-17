import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signInStaff } from "@/server/auth/auth-service";
import { hashPassword } from "@/server/auth/password";
import { BELLA, SAKURA, testDatabase } from "./helpers/db";

/**
 * One deployment = one restaurant, with ONE /admin/login. A super admin's team_members row lives in its HOME
 * restaurant, which is often not the deployment's restaurant. Sign-in used to fail there: it stamped
 * last_login_at on the home row while scoped to the restaurant being signed into, and the 0029 cross-restaurant
 * guard (RB403) refused the write.
 */
// unique per run: the test role may insert into auth.users but not delete from it (same as the app)
const EMAIL = `platform-dev+${Date.now()}@signin.test`;
const PASSWORD = "Platform#Signin1";

beforeAll(async () => {
  const hashed = await hashPassword(PASSWORD);
  await testDatabase.write({ restaurantId: BELLA.restaurantId }, async (tx) => {
    const user = await tx.queryOne<{ id: string }>(
      "insert into auth.users (id, email, encrypted_password) values (gen_random_uuid(), $1, $2) returning id",
      [EMAIL, hashed],
    );
    await tx.query(
      `insert into team_members (restaurant_id, user_id, email, full_name, role, is_active, accepted_at)
       values ($1, $2, $3, 'Platform Dev', 'super_admin', true, now())`,
      [BELLA.restaurantId, user!.id, EMAIL],
    );
  });
});

afterAll(async () => {
  await testDatabase.write({ restaurantId: BELLA.restaurantId }, async (tx) => {
    await tx.query("delete from team_members where lower(email) = $1", [EMAIL]);
  });
  await testDatabase.end();
});

describe("staff sign-in on a deployment that is not the member's home restaurant", () => {
  it("a super admin homed at Bella Napoli signs in to Sakura's admin and its own row records the login", async () => {
    const result = await signInStaff(EMAIL, PASSWORD, "sakura-sushi-house", "staff-signin-test");
    expect(result.restaurant.id).toBe(SAKURA.restaurantId);
    expect(result.member.role).toBe("super_admin");
    // read as the service role: team_members is RLS-protected from an anonymous reader
    const row = await testDatabase.write({ restaurantId: BELLA.restaurantId }, (db) =>
      db.queryOne<{ last_login_at: Date | null }>("select last_login_at from team_members where lower(email) = $1", [EMAIL]),
    );
    expect(row?.last_login_at).toBeTruthy();
  });

  it("an ordinary member of another restaurant is still refused", async () => {
    await expect(signInStaff("owner@bellanapoli.pk", "BellaNapoli#1", "sakura-sushi-house", "staff-signin-test-2")).rejects.toThrow(
      /Invalid email or password/,
    );
  });
});
