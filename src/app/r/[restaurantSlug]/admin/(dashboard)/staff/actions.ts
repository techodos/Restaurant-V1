"use server";

import { revalidatePath } from "next/cache";
import { adminPath } from "@/shared/utils";
import type { ApiResult } from "@/shared/contract/api";
import type { TeamMember } from "@/shared/contract/models";
import { action } from "@/server/errors";
import { addTeamMember, editTeamMember, removeTeamMember, setStaffActive } from "@/server/services/team";
import { createTeamMemberSchema, updateTeamMemberSchema } from "@/server/validation/team";
import { requirePermission } from "@/web/session";

export async function createStaffAction(payload: unknown): Promise<ApiResult<TeamMember>> {
  return action(async () => {
    const actor = await requirePermission("staff.manage");
    const input = createTeamMemberSchema.parse(payload);
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    const member = await addTeamMember(actor.restaurantId, input, ctx);
    revalidatePath(adminPath(actor.restaurantSlug, "/staff"));
    return member;
  });
}

export async function updateStaffAction(payload: unknown): Promise<ApiResult<TeamMember>> {
  return action(async () => {
    const actor = await requirePermission("staff.manage");
    const input = updateTeamMemberSchema.parse(payload);
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    const member = await editTeamMember(input.id, input, ctx);
    revalidatePath(adminPath(actor.restaurantSlug, "/staff"));
    return member;
  });
}

export async function setStaffActiveAction(memberId: string, isActive: boolean): Promise<ApiResult<null>> {
  return action(async () => {
    const actor = await requirePermission("staff.manage");
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    await setStaffActive(memberId, isActive, ctx);
    revalidatePath(adminPath(actor.restaurantSlug, "/staff"));
    return null;
  });
}

export async function deleteStaffAction(memberId: string): Promise<ApiResult<null>> {
  return action(async () => {
    const actor = await requirePermission("staff.manage");
    const ctx = { restaurantId: actor.restaurantId, userId: actor.userId, actor: actor.name };
    await removeTeamMember(memberId, ctx);
    revalidatePath(adminPath(actor.restaurantSlug, "/staff"));
    return null;
  });
}
