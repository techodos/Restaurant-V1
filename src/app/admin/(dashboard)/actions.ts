"use server";

import { action } from "@/server/errors";
import { signOutStaffSession } from "@/web/session";
import { selectAdminBranch } from "@/web/admin";
import type { ApiResult } from "@/shared/contract/api";

/** Ends this restaurant's admin session (the cookie is scoped to /r/<slug>/admin). */
export async function signOutAction(slug: string): Promise<ApiResult<null>> {
  return action(async () => {
    await signOutStaffSession(slug);
    return null;
  });
}

/**
 * The header's branch selector (owner/admin only; refused for branch-scoped staff). Setting the cookie
 * makes Next answer with the current page re-rendered for the new branch — no `router.refresh()`.
 */
export async function selectBranchAction(slug: string, value: string): Promise<ApiResult<null>> {
  return action(async () => {
    await selectAdminBranch(slug, value);
    return null;
  });
}
