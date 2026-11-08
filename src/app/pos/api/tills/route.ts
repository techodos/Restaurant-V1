import { registerTill } from "@/server/services/pos";
import { registerDeviceSchema } from "@/server/validation/pos";
import { posResponse, requirePosStaff } from "@/web/pos";

/** Registers this browser as a till at a branch (pos.manage). */
export async function POST(request: Request): Promise<Response> {
  return posResponse(async () => {
    const actor = await requirePosStaff("pos.manage", { fresh: true });
    return registerTill(actor, registerDeviceSchema.parse(await request.json()));
  });
}
