import { closeTillShift } from "@/server/services/pos";
import { closeShiftSchema } from "@/server/validation/pos";
import { posResponse, requirePosStaff } from "@/web/pos";

/** Day close: FISCAL_UNSYNCED (409-style refusal) while any invoice of the shift is not reported yet. */
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  return posResponse(async () => {
    const actor = await requirePosStaff("pos.use", { fresh: true });
    return closeTillShift(actor, closeShiftSchema.parse(await request.json()));
  });
}
