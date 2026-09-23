"use server";

import { config } from "@/server/config";
import { action } from "@/server/errors";
import { staffLoginSchema } from "@/server/validation/team";
import { signInStaffSession } from "@/web/session";
import type { ApiResult } from "@/shared/contract/api";

/** Staff sign-in. The client navigates to /admin after a successful result. */
export async function signInAction(payload: unknown): Promise<ApiResult<{ name: string }>> {
  return action(async () => {
    const input = staffLoginSchema.parse(payload);
    const actor = await signInStaffSession(input.email, input.password, config.app.defaultRestaurantSlug);
    return { name: actor.name };
  });
}
