import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createCustomerAccount, signInCustomer } from "@/server/auth/auth-service";
import { createGoogleCustomer, getCustomerByGoogleSubOrEmail, linkGoogleToCustomer } from "@/server/repositories/customers";
import { resetRateLimits } from "@/server/rate-limit";
import { BELLA, testDatabase } from "./helpers/db";

/**
 * customers has a unique (restaurant_id, phone). Sign-up and Google sign-up used `on conflict (phone) do update`,
 * so signing up with SOMEONE ELSE'S phone number rewrote their account's email/password (or Google link) and handed
 * the attacker a session for it. A phone number is never verified, so it must never be enough to take over a row.
 */

const restaurant = { id: BELLA.restaurantId };
const tag = () => randomUUID().slice(0, 8);
const phoneFor = () => `+9230${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;

beforeEach(() => resetRateLimits());
afterAll(async () => {
  await testDatabase.end();
});

async function account(id: string) {
  return testDatabase.write({}, (tx) =>
    tx.queryOne<{ email: string; password_hash: string | null; google_sub: string | null; is_guest: boolean }>(
      "select email, password_hash, google_sub, is_guest from customers where id = $1",
      [id],
    ),
  );
}

describe("a phone number never takes over another customer's account", () => {
  it("password sign-up with a registered phone is refused and the victim's login is untouched", async () => {
    const phone = phoneFor();
    const victim = await createCustomerAccount({ restaurant, fullName: "Victim", email: `victim-${tag()}@example.com`, phone, password: "VictimPass#1" });
    const before = await account(victim.customerId);

    await expect(
      createCustomerAccount({ restaurant, fullName: "Attacker", email: `attacker-${tag()}@example.com`, phone, password: "AttackerPass#1" }),
    ).rejects.toThrowError(/phone number/i);

    expect(await account(victim.customerId)).toEqual(before);
    await expect(signInCustomer(before!.email, "VictimPass#1", restaurant)).resolves.toMatchObject({ customerId: victim.customerId });
  });

  it("Google sign-up with a registered phone is refused and the account is not relinked", async () => {
    const phone = phoneFor();
    const victim = await createCustomerAccount({ restaurant, fullName: "Victim", email: `victim-${tag()}@example.com`, phone, password: "VictimPass#1" });
    const before = await account(victim.customerId);

    await expect(
      createGoogleCustomer(
        { restaurantId: restaurant.id, fullName: "Attacker", email: `attacker-${tag()}@example.com`, phone, googleSub: `g-${tag()}` },
        { restaurantId: restaurant.id },
      ),
    ).rejects.toThrowError(/phone number/i);
    expect(await account(victim.customerId)).toEqual(before);
  });

  it("a guest row with the same phone and email is still upgraded into the new account", async () => {
    const phone = phoneFor();
    const email = `guest-${tag()}@example.com`;
    const guest = await testDatabase.write({}, (tx) =>
      tx.queryOne<{ id: string }>(
        "insert into customers (restaurant_id, full_name, email, phone, is_guest) values ($1,'Guest',$2,$3,true) returning id",
        [restaurant.id, email, phone],
      ),
    );
    const created = await createCustomerAccount({ restaurant, fullName: "Guest Now Member", email, phone, password: "MemberPass#1" });
    expect(created.customerId).toBe(guest!.id);
    expect((await account(guest!.id))?.is_guest).toBe(false);
  });

  it("a guest row with the same phone but another email is not claimed", async () => {
    const phone = phoneFor();
    await testDatabase.write({}, (tx) =>
      tx.query("insert into customers (restaurant_id, full_name, email, phone, is_guest) values ($1,'Guest',$2,$3,true)", [
        restaurant.id,
        `someone-${tag()}@example.com`,
        phone,
      ]),
    );
    await expect(
      createCustomerAccount({ restaurant, fullName: "Other", email: `other-${tag()}@example.com`, phone, password: "OtherPass#1" }),
    ).rejects.toThrowError(/phone number/i);
  });

  it("linking Google to an account whose email was never verified drops the password set by whoever registered it", async () => {
    const email = `prehijack-${tag()}@example.com`;
    // someone registers the victim's email with their own password and never verifies it...
    const squatter = await createCustomerAccount({ restaurant, fullName: "Squatter", email, phone: phoneFor(), password: "Squatter#1" });
    // ...then the real owner of the inbox signs in with Google, which links onto that row
    const existing = await getCustomerByGoogleSubOrEmail(restaurant.id, `g-${tag()}`, email, { restaurantId: restaurant.id });
    expect(existing?.id).toBe(squatter.customerId);
    await linkGoogleToCustomer(existing!.id, `g-${tag()}`, { restaurantId: restaurant.id, customerId: existing!.id });

    await expect(signInCustomer(email, "Squatter#1", restaurant)).rejects.toThrowError(/invalid email or password/i);
  });

  it("linking Google keeps the password of an account that had verified its email", async () => {
    const email = `verified-${tag()}@example.com`;
    const owner = await createCustomerAccount({ restaurant, fullName: "Owner", email, phone: phoneFor(), password: "OwnerPass#1" });
    await testDatabase.write({}, (tx) => tx.query("update customers set is_email_verified = true where id = $1", [owner.customerId]));
    await linkGoogleToCustomer(owner.customerId, `g-${tag()}`, { restaurantId: restaurant.id, customerId: owner.customerId });

    await expect(signInCustomer(email, "OwnerPass#1", restaurant)).resolves.toMatchObject({ customerId: owner.customerId });
  });
});
