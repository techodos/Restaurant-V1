import { refundSale } from "@/server/services/pos";
import { refundSchema } from "@/server/validation/pos";
import { posResponse, requirePosStaff } from "@/web/pos";

/** Full refund as a credit note (pos.manage). Online only: the till numbers it from its own sequence. */
export async function POST(request: Request): Promise<Response> {
  return posResponse(async () => {
    const actor = await requirePosStaff("pos.manage", { fresh: true });
    return refundSale(actor, refundSchema.parse(await request.json()));
  });
}
