import { openTillShift } from "@/server/services/pos";
import { openShiftSchema } from "@/server/validation/pos";
import { posResponse, requirePosStaff } from "@/web/pos";

export async function POST(request: Request): Promise<Response> {
  return posResponse(async () => {
    const actor = await requirePosStaff("pos.use", { fresh: true });
    return openTillShift(actor, openShiftSchema.parse(await request.json()));
  });
}
