"use server";

import { action } from "@/server/errors";
import { staffLoginSchema } from "@/server/validation/team";
import { callerIdentifier } from "@/web/session";
import { signInPosSession } from "@/web/pos";
import { instanceRestaurantSlug } from "@/web/instance";
import type { ApiResult } from "@/shared/contract/api";

/** Till sign-in: a staff member with pos.use (cashier, manager, owner). The client then opens /pos. */
export async function posSignInAction(payload: unknown): Promise<ApiResult<{ name: string }>> {
  return action(async () => {
    const input = staffLoginSchema.parse(payload);
    const actor = await signInPosSession(input.email, input.password, `${instanceRestaurantSlug()}:pos:${await callerIdentifier()}`);
    return { name: actor.name };
  });
}
