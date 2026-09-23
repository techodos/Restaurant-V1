"use server";

import { action } from "@/server/errors";
import { signOutStaffSession } from "@/web/session";
import type { ApiResult } from "@/shared/contract/api";

export async function signOutAction(): Promise<ApiResult<null>> {
  return action(async () => {
    await signOutStaffSession();
    return null;
  });
}
