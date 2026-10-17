"use server";

import { action } from "@/server/errors";
import { staffLoginSchema } from "@/server/validation/team";
import { callerIdentifier, signInStaffSession } from "@/web/session";
import type { ApiResult } from "@/shared/contract/api";

/**
 * Staff sign-in to one restaurant's admin. `slug` is the restaurant in the URL; signInStaff only accepts a member of
 * that restaurant. The client navigates to /r/<slug>/admin after a successful result.
 */
export async function signInAction(slug: string, payload: unknown): Promise<ApiResult<{ name: string; superAdmin: boolean }>> {
  return action(async () => {
    const input = staffLoginSchema.parse(payload);
    // rate limit per restaurant and caller, so failed attempts elsewhere never lock this restaurant's staff out
    const actor = await signInStaffSession(input.email, input.password, slug, `${slug}:${await callerIdentifier()}`);
    return { name: actor.name, superAdmin: actor.role === "super_admin" };
  });
}
