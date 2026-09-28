"use server";

import { action } from "@/server/errors";
import { signOutStaffSession } from "@/web/session";
import type { ApiResult } from "@/shared/contract/api";

/** Ends this restaurant's admin session (the cookie is scoped to /r/<slug>/admin). */
export async function signOutAction(slug: string): Promise<ApiResult<null>> {
  return action(async () => {
    await signOutStaffSession(slug);
    return null;
  });
}
